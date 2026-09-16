import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  safeParseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type Team,
} from "@breachverse/protocol";
import { MatchCoordinator, MatchError } from "./matches/MatchCoordinator.js";

const port = Number.parseInt(process.env.BREACHVERSE_PORT ?? "8787", 10);
const debug = process.env.BREACHVERSE_DEBUG === "1";
const coordinator = new MatchCoordinator({ debug });
const sessions = new Map<WebSocket, { code: string; role: Team }>();

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify({ ok: true, service: "breachverse-game-server", protocolVersion: PROTOCOL_VERSION }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const websocketServer = new WebSocketServer({ server });

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcastViews(code: string, reason: "presence" | "plan" | "ready" | "resolution" | "snapshot"): void {
  const match = coordinator.getMatch(code);
  for (const [socket, session] of sessions) {
    if (session.code !== match.code) continue;
    send(socket, { type: "player_view", reason, view: coordinator.viewFor(match, session.role) });
  }
}

function requireSession(socket: WebSocket, requestId: string): { code: string; role: Team } {
  const session = sessions.get(socket);
  if (!session) throw new MatchError("NOT_JOINED", `Request ${requestId} requires an active match seat.`);
  return session;
}

function handleMessage(socket: WebSocket, message: ClientMessage): void {
  if (message.type === "create_match") {
    if (sessions.has(socket)) throw new MatchError("ALREADY_JOINED", "This connection already has a seat.");
    const match = coordinator.createMatch(message.role);
    sessions.set(socket, { code: match.code, role: message.role });
    send(socket, {
      type: "session_joined",
      requestId: message.requestId,
      role: message.role,
      matchCode: match.code,
      view: coordinator.viewFor(match, message.role),
    });
    return;
  }

  if (message.type === "join_match") {
    if (sessions.has(socket)) throw new MatchError("ALREADY_JOINED", "This connection already has a seat.");
    const match = coordinator.joinMatch(message.code, message.role);
    sessions.set(socket, { code: match.code, role: message.role });
    send(socket, {
      type: "session_joined",
      requestId: message.requestId,
      role: message.role,
      matchCode: match.code,
      view: coordinator.viewFor(match, message.role),
    });
    broadcastViews(match.code, "presence");
    return;
  }

  const session = requireSession(socket, message.requestId);
  if (message.type === "submit_plan") {
    coordinator.submitPlan(session.code, session.role, message.turn, message.actions);
    broadcastViews(session.code, "plan");
    return;
  }
  if (message.type === "set_ready") {
    const result = coordinator.setReady(session.code, session.role, message.turn);
    broadcastViews(session.code, result.resolved ? "resolution" : "ready");
    return;
  }
  if (message.type === "request_snapshot") {
    const match = coordinator.getMatch(session.code);
    send(socket, { type: "player_view", reason: "snapshot", view: coordinator.viewFor(match, session.role) });
  }
}

websocketServer.on("connection", (socket) => {
  send(socket, { type: "connected", protocolVersion: PROTOCOL_VERSION });

  socket.on("message", (raw) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString()) as unknown;
    } catch {
      send(socket, { type: "error", requestId: null, code: "INVALID_JSON", message: "Message was not valid JSON." });
      return;
    }
    const parsed = safeParseClientMessage(parsedJson);
    if (!parsed.success) {
      send(socket, { type: "error", requestId: null, code: "INVALID_MESSAGE", message: "Message did not match protocol version 1." });
      return;
    }
    try {
      handleMessage(socket, parsed.data);
    } catch (error) {
      const requestId = parsed.data.requestId;
      if (error instanceof MatchError) {
        send(socket, { type: "error", requestId, code: error.code, message: error.message });
      } else {
        console.error(error);
        send(socket, { type: "error", requestId, code: "SERVER_ERROR", message: "The server could not process that request." });
      }
    }
  });

  socket.on("close", () => {
    const session = sessions.get(socket);
    sessions.delete(socket);
    if (!session) return;
    const match = coordinator.leaveMatch(session.code, session.role);
    if (match) broadcastViews(match.code, "presence");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`BreachVerse authoritative server listening on http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}`);
  console.log(`Authoritative debug logging: ${debug ? "enabled" : "disabled"}`);
});
