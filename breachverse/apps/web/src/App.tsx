import { useCallback, useEffect, useState } from "react";
import type { ActionDefinition, PlannedAction, Team } from "@breachverse/protocol";
import { NetworkMap } from "./features/network-map/NetworkMap.js";
import { useGameSocket } from "./transport/useGameSocket.js";

function actionCost(plan: PlannedAction[], definitions: ActionDefinition[]): number {
  return plan.reduce((total, item) => total + (definitions.find((definition) => definition.id === item.type)?.cost ?? 0), 0);
}

export default function App() {
  const { connection, view, error, clearError, createMatch, joinMatch, lockPlan } = useGameSocket();
  const [role, setRole] = useState<Team>("RED");
  const [joinCode, setJoinCode] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlannedAction[]>([]);
  const [lastTurn, setLastTurn] = useState<number | null>(null);
  const selectNode = useCallback((nodeId: string) => setSelectedNodeId(nodeId), []);

  useEffect(() => {
    if (!view) return;
    if (lastTurn !== view.turn) {
      setDraft([]);
      setLastTurn(view.turn);
    }
    if (!selectedNodeId || !view.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(view.nodes[0]?.id ?? null);
    }
  }, [lastTurn, selectedNodeId, view]);

  const definitions = view?.availableActions ?? [];
  const spent = actionCost(draft, definitions);
  const remaining = (view?.apBudget ?? 6) - spent;
  const selectedNode = view?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const applicableActions = definitions.filter((action) => selectedNodeId && action.eligibleTargetIds.includes(selectedNodeId));

  const queueAction = (definition: ActionDefinition) => {
    if (!view || !selectedNodeId || definition.cost > remaining || view.ownReady) return;
    setDraft((current) => [...current, {
      id: globalThis.crypto.randomUUID(),
      type: definition.id,
      targetNodeId: selectedNodeId,
      order: current.length,
    }]);
  };

  const removeAction = (id: string) => {
    setDraft((current) => current.filter((action) => action.id !== id).map((action, order) => ({ ...action, order })));
  };

  const lock = () => {
    if (!view || view.phase !== "PLANNING" || view.ownReady) return;
    lockPlan(view.turn, draft);
  };

  if (!view) {
    return (
      <main className="lobby-shell">
        <section className="lobby-card">
          <div className="eyebrow">LOCAL OPERATIONS TABLE / MILESTONE 1</div>
          <h1>Breach<span>Verse</span></h1>
          <p className="lobby-lede">Two perspectives. One authoritative reality.</p>
          <div className="rule" />
          <div className="role-picker" aria-label="Choose team">
            {(["RED", "BLUE"] as const).map((team) => (
              <button key={team} className={`role-choice ${role === team ? "active" : ""} ${team.toLowerCase()}`} onClick={() => setRole(team)}>
                <small>{team === "RED" ? "OFFENSE" : "DEFENSE"}</small>
                {team}
              </button>
            ))}
          </div>
          <button className="primary-command" disabled={connection !== "CONNECTED"} onClick={() => createMatch(role)}>
            Create match as {role}
          </button>
          <div className="join-row">
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={5} placeholder="MATCH CODE" aria-label="Match code" />
            <button disabled={connection !== "CONNECTED" || joinCode.length < 5} onClick={() => joinMatch(joinCode, role)}>Join</button>
          </div>
          <div className={`connection-readout ${connection.toLowerCase()}`}><i /> Authoritative server: {connection.toLowerCase()}</div>
          {error && <button className="error-strip" onClick={clearError}>{error}</button>}
        </section>
      </main>
    );
  }

  const newestEvents = [...view.events].reverse();
  const waiting = view.phase === "LOBBY";
  const ended = view.phase === "ENDED";

  return (
    <main className={`game-shell team-${view.role.toLowerCase()}`}>
      <header className="command-header">
        <div className="brand-block"><strong>BREACHVERSE</strong><span>LOCAL OPERATIONS TABLE</span></div>
        <div className="header-metrics">
          <div><small>TURN</small><b>{String(view.turn).padStart(2, "0")} / {view.turnLimit}</b></div>
          <div><small>ROLE</small><b className="team-text">{view.role}</b></div>
          <div><small>MATCH</small><b>{view.matchCode}</b></div>
          <div><small>SEED</small><b>{view.seed}</b></div>
        </div>
        <div className={`live-state ${connection.toLowerCase()}`}><i />{connection}</div>
      </header>

      <section className="workspace">
        <aside className="intel-panel panel">
          <div className="panel-heading"><span>01</span><div><small>OBSERVATION CHANNEL</small><h2>{view.role === "RED" ? "Field intelligence" : "Security operations"}</h2></div></div>
          <div className="objective-card"><small>CURRENT OBJECTIVE</small><p>{view.objective}</p></div>
          <div className="event-feed">
            {newestEvents.length === 0 && <p className="empty-copy">No resolved observations. Plan the opening turn.</p>}
            {newestEvents.map((event) => (
              <article className={`event-item tone-${event.tone.toLowerCase()}`} key={event.id}>
                <div><span>T{String(event.turn).padStart(2, "0")}</span><em>{event.category}</em></div>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </aside>

        <section className="board-panel panel">
          <div className="board-heading">
            <div><small>LIVE PROJECTION / {view.role}</small><h2>Northstar Holdings</h2></div>
            <div className="legend"><span><i className="healthy" /> observed</span><span><i className="alert" /> changed</span></div>
          </div>
          <NetworkMap view={view} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
          <div className="board-note">Drag to pan · wheel to zoom · select an asset to plan</div>
          {waiting && <div className="board-curtain"><strong>WAITING FOR OPPOSING SEAT</strong><span>Share match code {view.matchCode}</span></div>}
        </section>

        <aside className="action-panel panel">
          <div className="panel-heading"><span>02</span><div><small>SELECTED ASSET</small><h2>{selectedNode?.id ?? "No selection"}</h2></div></div>
          {selectedNode ? (
            <>
              <div className="asset-profile">
                <div><small>CLASS</small><b>{selectedNode.kind.replaceAll("_", " ")}</b></div>
                <div><small>STATE</small><b>{selectedNode.status}</b></div>
                <div><small>KNOWLEDGE</small><b>{selectedNode.knowledge}</b></div>
                <div><small>REACHABLE</small><b>{selectedNode.reachable ? "YES" : "NO"}</b></div>
              </div>
              {(selectedNode.platform || selectedNode.services.length > 0) && (
                <div className="known-details">
                  {selectedNode.platform && <p><small>PLATFORM</small>{selectedNode.platform}</p>}
                  {selectedNode.edrEnabled !== null && <p><small>EDR</small>{selectedNode.edrEnabled ? "ACTIVE" : "NONE"}</p>}
                  {selectedNode.patchLevel !== null && <p><small>PATCH</small>{selectedNode.patchLevel}%</p>}
                  {selectedNode.monitoring !== null && <p><small>MONITORING</small>{selectedNode.monitoring}%</p>}
                  {selectedNode.services.map((service) => <p key={`${service.port}-${service.name}`}><small>PORT {service.port}</small>{service.name}</p>)}
                </div>
              )}
              <div className="action-list">
                <div className="section-label">AVAILABLE ORDERS</div>
                {definitions.map((definition) => {
                  const eligible = applicableActions.some((action) => action.id === definition.id);
                  return (
                    <button key={definition.id} disabled={!eligible || definition.cost > remaining || view.ownReady} onClick={() => queueAction(definition)}>
                      <span><b>{definition.name}</b><small>{definition.description}</small></span><em>{definition.cost} AP</em>
                    </button>
                  );
                })}
              </div>
            </>
          ) : <p className="empty-copy">Select an observed node on the operations table.</p>}
        </aside>
      </section>

      <footer className="turn-dock">
        <div className="ap-meter">
          <div><small>ACTION POINTS</small><strong>{remaining}</strong><span>/ {view.apBudget}</span></div>
          <div className="ap-track">{Array.from({ length: view.apBudget }, (_, index) => <i className={index < remaining ? "available" : "spent"} key={index} />)}</div>
        </div>
        <div className="queue">
          <small>SECRET PLAN · {draft.length} ORDERS</small>
          <div>
            {draft.length === 0 && <span className="empty-queue">No orders queued</span>}
            {draft.map((item, index) => {
              const definition = definitions.find((candidate) => candidate.id === item.type);
              return <button key={item.id} disabled={view.ownReady} onClick={() => removeAction(item.id)}><i>{index + 1}</i>{definition?.name}<span>{item.targetNodeId}</span><b>×</b></button>;
            })}
          </div>
        </div>
        <div className="readiness">
          <span>OPPONENT <b className={view.opponentReady ? "ready" : ""}>{view.opponentReady ? "READY" : "PLANNING"}</b></span>
          <button className={view.ownReady ? "locked" : ""} disabled={waiting || ended || view.ownReady} onClick={lock}>
            {view.ownReady ? "PLAN LOCKED" : "READY / LOCK PLAN"}
          </button>
        </div>
      </footer>

      {error && <button className="floating-error" onClick={clearError}>{error}</button>}
      {ended && (
        <div className="end-overlay">
          <section>
            <small>MATCH COMPLETE / {view.endReason?.replaceAll("_", " ")}</small>
            <h2><span className={`winner-${view.winner?.toLowerCase()}`}>{view.winner}</span> controls the outcome</h2>
            <div className="final-score"><span>RED {view.score.RED}</span><i /><span>BLUE {view.score.BLUE}</span></div>
            <button onClick={() => window.location.reload()}>Open a new operations table</button>
          </section>
        </div>
      )}
    </main>
  );
}
