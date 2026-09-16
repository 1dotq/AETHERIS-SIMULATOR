import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  type PlannedAction,
  type PlayerView,
  type ServerMessage,
  type Team,
} from "@breachverse/protocol";

type ConnectionState = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingReadyTurn = useRef<number | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("CONNECTING");
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const configured = import.meta.env.VITE_BREACHVERSE_WS_URL as string | undefined;
    const url = configured ?? `ws://${window.location.hostname}:8787`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnection("CONNECTED"));
    socket.addEventListener("close", () => setConnection("DISCONNECTED"));
    socket.addEventListener("error", () => setError("Could not reach the authoritative game server."));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "session_joined" || message.type === "player_view") {
        setView(message.view);
        setError(null);
      }
      if (message.type === "player_view" && message.reason === "plan" && pendingReadyTurn.current !== null) {
        const turn = pendingReadyTurn.current;
        pendingReadyTurn.current = null;
        socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: requestId(), type: "set_ready", turn }));
      }
      if (message.type === "error") {
        pendingReadyTurn.current = null;
        setError(message.message);
      }
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("The server connection is not open.");
      return false;
    }
    socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: requestId(), ...payload }));
    return true;
  }, []);

  const createMatch = useCallback((role: Team) => send({ type: "create_match", role }), [send]);
  const joinMatch = useCallback((code: string, role: Team) => send({ type: "join_match", code: code.toUpperCase(), role }), [send]);
  const lockPlan = useCallback((turn: number, actions: PlannedAction[]) => {
    pendingReadyTurn.current = turn;
    return send({ type: "submit_plan", turn, actions });
  }, [send]);

  return { connection, view, error, clearError: () => setError(null), createMatch, joinMatch, lockPlan };
}

