# BreachVerse Milestone 1

Milestone 1 is a separate, additive workspace under `breachverse/`. It does not modify the AETHERIS runtime. It proves one authoritative, simultaneous-turn Red-versus-Blue match with an in-memory server, explicit fog-of-war projections, and a React/PixiJS browser client.

## Requirements and installation

- Node.js 22 or newer
- npm 10 or newer

From the repository root:

```bash
cd breachverse
npm install
```

## Run locally

Start the server and web client together:

```bash
cd breachverse
npm run dev
```

The web client is available at `http://localhost:5173`. The authoritative server listens at `http://localhost:8787`, with WebSockets on `ws://localhost:8787` and a health check at `http://localhost:8787/health`.

To run them in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

Enable additional authoritative server diagnostics with:

```bash
BREACHVERSE_DEBUG=1 npm run dev:server
```

The normal Red and Blue protocol never includes this authoritative debug state.

## Play a local match

1. Open `http://localhost:5173` in two browser windows.
2. In the first window, select Red and choose **Create match as Red**.
3. Copy the five-character match code from the header.
4. In the second window, select Blue, enter the code, and choose **Join**.
5. Select a visible node, queue orders within the six-AP budget, and choose **Ready / Lock plan** in each window.
6. The server resolves only after both occupied seats are locked. Each client then receives its role-specific projection for the next turn.
7. Continue until Red exfiltrates protected data, Blue identifies and contains every foothold, or Blue survives through turn 12.
8. At match end, use **Open a new operations table** and create a new match.

There is no reconnect token in Milestone 1. Keep both windows open for the duration of a match.

## Architecture

```text
apps/web (React + PixiJS)
        |
        | strict versioned WebSocket messages
        v
apps/game-server (in-memory match coordinator)
        |
        +-- packages/engine      deterministic validation/resolution/projection
        +-- packages/scenarios   hard-coded Northstar Holdings world factory
        +-- packages/domain      server-owned state and shared vocabulary
        +-- packages/protocol    client intent and projected-view contracts
```

The server owns the match code, seats, seed, turn, phase, AP validation, submitted plans, authoritative world, resolution, events, scores, and victory state. Browser code sends intent and renders `PlayerView`; it does not calculate outcomes. An ESLint boundary prevents the web application from importing the engine, scenarios, or authoritative domain package directly.

The initial organization contains Internet, `EDGE-FW01`, `CORP-SW01`, `DC01`, `FILE01`, and three workstations. Alice, Bob, and Carol are modeled separately from their credentials. The authoritative nodes include vulnerabilities, patching, EDR, detection, compromise, access, isolation, and protected-data state. Projection functions construct new Red and Blue response objects, omitting fields the recipient cannot observe.

The PixiJS renderer consumes a small renderer-facing model derived from `PlayerView`. It does not retain or mutate authoritative objects. It supports selection, pan, zoom, role/state styling, blocked links, and restrained event pulses.

## Turn lifecycle

```text
LOBBY -> PLANNING -> both plans locked -> RESOLUTION
      -> authoritative events -> role projections -> next PLANNING turn
```

Each side has six AP per turn. A submitted plan remains private. `READY` locks it; later modification attempts are rejected. Actions resolve in stable speed/order/action-ID order using a turn seed derived from the match seed. Authoritative logic uses the explicit seeded RNG abstraction and never calls `Math.random()`.

## WebSocket protocol

Every client message includes `protocolVersion: 1` and a `requestId`. Inputs are strict runtime-validated schemas.

Client messages:

- `create_match`: choose an un-authenticated Red or Blue seat and create a match.
- `join_match`: join the requested role using a match code.
- `submit_plan`: replace the caller's current unlocked action list for the stated turn.
- `set_ready`: lock the caller's plan for the stated turn.
- `request_snapshot`: request the caller's current projected view.

Server messages:

- `connected`: confirms protocol compatibility.
- `session_joined`: confirms the seat and supplies the first projected view.
- `player_view`: supplies a fresh role-specific projection after presence, plan, ready, resolution, or snapshot changes.
- `error`: supplies a stable code and safe message without authoritative state.

The server never sends a generic world-state message. Authoritative events are retained in sequence order; each view contains only projected event text and safe identifiers. This is the foundation for a later full replay/export system.

## Current actions

Red:

- Recon Node — 1 AP
- Scan Service — 1 AP
- Credential Attack — 2 AP
- Gain Foothold — 2 AP
- Lateral Movement — 2 AP
- Exfiltrate Data — 3 AP

Blue:

- Investigate Node — 1 AP
- Increase Monitoring — 1 AP
- Isolate Node — 2 AP
- Disable Account — 2 AP
- Threat Hunt — 2 AP

All actions are abstract strategic rules. No real exploitation, commands, malware, or machine virtualization is involved.

## Verification

Run the complete automated check:

```bash
cd breachverse
npm run check
```

This runs ESLint, all workspace TypeScript checks, the headless engine/server/protocol tests, and the production frontend build. The tests cover deterministic RNG and resolution, AP and action validation, reachability, locked turns, the two-player resolution barrier, both role projections, hidden event fields and targets, both victory paths, protocol validation, private plans, and replay ordering.

## Known limitations

- Match state and authoritative events live only in server memory and disappear on restart.
- There is no authentication, reconnect token, resume flow, spectator, replay viewer, or replay export.
- A disconnect releases that seat and returns an active match to the lobby.
- The scenario, starting visibility, turn budget, turn limit, rules, and balance are fixed.
- There is no planning clock, surrender command, AI opponent, accessibility audit, or mobile layout.
- Security telemetry and detection rules are intentionally shallow first-pass mechanics.
- PixiJS is loaded in the primary client bundle; the current production build emits a bundle-size warning. Renderer lazy-loading/code splitting is deferred until it is justified by Milestone 2 scope.
- The UI has simple event pulses, but no elaborate action choreography or replay animation.

## Current UI

The interface uses an off-black operations-table layout with restrained role color rather than a neon hacker motif. The top command bar shows turn, role, match code, deterministic seed, and connection state. Field intelligence/SOC observations occupy the left panel; the pannable, zoomable topology is centered; selected-asset facts and eligible orders are on the right. A persistent lower dock shows AP, the secret queued plan, opponent readiness, and the plan-lock control. Red begins with a sparse topology, while Blue begins with the complete managed inventory and defensive posture.

