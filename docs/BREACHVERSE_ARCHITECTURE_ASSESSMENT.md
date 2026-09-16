# BreachVerse architecture assessment

Status: initial repository audit and prototype proposal  
Scope: assessment only; no AETHERIS runtime code has been changed  
Repository baseline: `main` at `b43aefe`

## Executive decision

BreachVerse should be added beside AETHERIS, not built by converting the existing application in place.

For the first playable prototype, use:

- React + TypeScript + Vite for the browser application.
- PixiJS for the network board, behind a small renderer adapter.
- A separate authoritative Node.js/TypeScript game server using HTTP plus WebSockets.
- A pure TypeScript rules engine shared only as a package dependency of the server and tests, never executed authoritatively by clients.
- An authoritative in-memory match state plus an append-only canonical event log for the local prototype.
- Per-player server projections for fog of war. A client is sent a projection, never `WorldState`.
- Seeded deterministic randomness owned by the match engine.
- PostgreSQL later, after the turn loop is fun and stable. Do not add Redis, containers, queues, or cloud services to milestone one.

The strongest AETHERIS assets are its topology vocabulary, interaction ideas, Dijkstra pathfinding, visual language, network/ICS concepts, process equations, safety interlocks, and accumulated scenario content. Its multiplayer authority model, flat node status, browser-global architecture, battle resolution, and DOM-bound simulation are not safe foundations for BreachVerse.

The recommended preservation strategy is an additive `breachverse/` workspace. Leave the existing root HTML/JS/CSS and Android wrapper untouched until the new prototype reaches parity with the pieces intentionally reused.

## 1. Repository architecture report

### Audit scope

The audit covered all hand-authored runtime files, documentation, server code, Android wrapper/source assets, and tracked build output. JavaScript and Python syntax checks pass. There are no tracked automated tests.

Current size indicators:

| Area | Observation |
|---|---|
| Browser runtime | About 24,500 lines across JS, HTML, CSS, and Python |
| `app.js` | 11,246 lines; application state, UI, labs, CLI, routing, attacks, reports, battle UI, and feature tools |
| `network-canvas.js` | 3,523 lines; topology model, input, rendering, animations, and graph helpers |
| `index.html` | 1,865 lines, 331 element IDs, 91 inline `onclick` handlers, and 545 inline style attributes |
| Global coupling | 151 `window.appInstance` references and 436 `getElementById` calls in `app.js` |
| Randomness | 198 `Math.random` calls in hand-authored JS |
| Tests | None |
| Tracked files | 561 total; 500 are Android `app/build` outputs and 17 are `.gradle` cache files |

### Current runtime shape

```text
index.html
  loads ordered global scripts
      physics-sim.js
      network-canvas.js
      llm-service.js
      orchestrator.js
      wireshark.js
      packet-tracer.js
      inspector.js
      ai-agents.js
      evolution-engine.js
      multiplayer.js
      app.js
        creates window.appInstance = new DigitalTwinApp()

server.py
  serves the same static files
  exposes HTTP polling relay endpoints under /mp/*
```

There is no module loader, bundler, type system, dependency graph, schema validation layer, or separation between domain state and view state. Script load order is the dependency system.

### Important modules

| File | Current responsibility | Architectural observation |
|---|---|---|
| `app.js` | Composition root plus nearly every product feature | God object. Domain logic, UI rendering, persistence, CLI, topology editing, telemetry, lab definitions, reports, attacks, and multiplayer UI are interleaved. |
| `network-canvas.js` | Nodes/links, topology templates, graph routing, pan/zoom, hit testing, immediate-mode Canvas rendering, effects | Useful behavior inventory, but model, controller, renderer, and application globals are fused. |
| `physics-sim.js` | Reactor, water treatment, and power grid continuous simulations | Reactor math is relatively self-contained. Chart/DOM access and unseeded demand variation must be removed before reuse. |
| `orchestrator.js` | Alerts, auto-mitigation, microsegmentation, reactor anomaly checks, terminal parser | Rules directly mutate canvas nodes, physics state, links, and DOM. It is not a standalone rules engine. |
| `ai-agents.js` | Real-time Red and Blue state machines plus battle win checks | Useful action/tactic vocabulary. Outcomes directly mutate shared node status using wall-clock timers and `Math.random`. Both agents see truth. |
| `evolution-engine.js` | Genetic strategies and headless battles | Shows value in pure headless simulation, but its simplified rules and unseeded RNG are unsuitable as authoritative match physics. |
| `multiplayer.js` | Session client, polling, heartbeat, action/state messages | Peer relay client. Blue browser is authoritative for AI battle state. |
| `server.py` | Static server and persisted in-memory message queues | Transport relay only; it has no match, player, rules, visibility, authorization, or validation model. |
| `packet-tracer.js` | Path visualization and synthetic OSI hop detail | Strong presentation concept; path logic should live in the engine and presentation should consume observations. |
| `wireshark.js` | Synthetic packet capture UI | Useful visual/educational concept, but data is client-generated and not authoritative telemetry. |
| `inspector.js` | Device notes, chassis display, protocols, CVE mockups | Useful UI concept; currently DOM/template-string bound. |
| `llm-service.js` | Direct browser calls to Gemini/Anthropic and topology command extraction | Explicitly outside MVP. API keys are stored in browser local storage and topology commands originate from model text. |
| `index.html` / `styles.css` | Whole application shell and design system | Visually rich reference, but huge static DOM, inline events/styles, and feature-specific selectors make incremental state management difficult. |
| `netsim-android/` | WebView wrapper with duplicated browser assets | The Android copy has drifted substantially from root web assets. Generated build/cache artifacts and an APK are tracked. |
| `docs/` | Standalone marketing page and media | Separate from the simulator runtime. |

### Current simulation loop

`DigitalTwinApp.loop()` is a `requestAnimationFrame` loop tied to browser time.

On active frames it:

1. Computes wall-clock delta and caps large jumps.
2. Advances the selected continuous physical simulation.
3. Runs reactor-specific orchestrator detection and mitigation.
4. Ticks the challenge timer.
5. Ticks the Red/Blue battle unless the browser is the Red multiplayer joiner.
6. Runs OSPF synchronization approximately every five simulated seconds.
7. Updates packet particles, tickers, statistics, link utilization, and threat visuals.
8. Redraws the entire topology and reactor chart.

This is appropriate for a single-browser visual simulator, but it conflates rendering cadence, simulation cadence, wall time, AI cadence, and authority. It is not replayable or deterministic. A BreachVerse turn must instead be resolved as a pure server transaction independent of frame rate.

### Rendering architecture

`NetworkTwinCanvas` is an immediate-mode HTML Canvas renderer with:

- Manual pan/zoom transforms.
- Linear node and link hit testing.
- Node dragging and grid snapping.
- Curved links, protocol labels, node role-specific hardware drawings, Purdue overlays, and physical plant drawings.
- Packet particles, battle packets, attack arcs, selection/hover, compromise/containment effects, blast radius, segmentation gaps, heat maps, kill-chain trails, and stealth rings.
- Dijkstra traversal over active, non-isolated links.

Every draw redraws the world and repeatedly searches node arrays by ID. Many overlay methods also perform their own graph scans. That is acceptable at current topology sizes, but it makes state projection, testing, renderer replacement, and larger maps difficult. The renderer also calls `window.appInstance` directly for commands, physics values, saves, logs, and modal UI.

What is worth preserving is the visual behavior specification: layer order, interaction feel, effect timing, link semantics, and device icon vocabulary. The class itself should remain with AETHERIS.

### Network, security, and ICS modeling

The current logical data model is deliberately lightweight:

```text
node = { id, name, ip, type, role, x, y, status, firmware, os, ... }
link = { sourceId, targetId, status, encrypted, protocol, interfaces, ... }
```

Device configuration is generated lazily in `app.js` and holds interfaces, static routes, ACLs, DHCP state, and Modbus coils. Connectivity uses both simple physical graph traversal and a separate L3 helper. Firewall enforcement is a small string-matching check during ping; it is not a general policy engine.

Security state is mostly collapsed into `node.status` (`stable`, `compromised`, `isolated`, and related visual variants). This cannot represent identity compromise, credentials, access level, persistence, partial knowledge, multiple attackers, simultaneous defensive state, or uncertain observations.

The reactor simulation has genuine reusable structure: mass balance, thermal feedback, pressure approximation, relief behavior, alarm thresholds, spoofed readings, and an SIS interlock. Water and grid simulations provide similar extension examples. However, physical state is mutated directly from UI/CLI/orchestrator code and is stepped by browser frame delta. For a future ICS mode it should become a pure scenario plugin stepped internally during server turn resolution.

### Current multiplayer implementation

The protocol contains the requested concepts, but its trust model is the opposite of BreachVerse's needs.

Current flow:

```text
Blue browser (host and battle authority)
    -> POST messages -> server.py queue -> Red browser polls
Red browser
    -> POST messages -> server.py queue -> Blue browser polls
```

Messages include `PEER_JOIN`, `PEER_LEAVE`, `HEARTBEAT`, `ATTACK_NODE`, `DEFEND_NODE`, `STATE_SYNC`, and `BATTLE_SYNC`.

Key findings:

- Blue's browser runs the battle and pushes node statuses, scores, phases, and combined logs.
- `ATTACK_NODE` and `DEFEND_NODE` immediately mutate node status in the sender and receiver browsers.
- Both clients possess the whole topology and state; there is no fog-of-war boundary.
- The relay accepts a caller-provided role and has no player/session token, authorization, action validation, rate limiting, or authoritative sequence number.
- Join can auto-create sessions, seats are not exclusive, and any sender knowing an ID can address either queue.
- Session expiry is based on creation time rather than activity, so an active session is deleted after ten minutes.
- Queues and full messages are written to `.mp_sessions.json` frequently, while errors are generally swallowed.
- `BATTLE_SYNC` has protocol drift: it assigns fields that do not drive all displayed battle getters, and attempts to replace a getter-only combined log.
- Polling at 600 ms is adequate for a demo but creates needless latency and race conditions for lockstep turns.

Conclusion: retain message names and UX lessons as historical input only. Replace `server.py` and `multiplayer.js` for BreachVerse.

### Coupling map

The principal coupling is bidirectional:

```text
DOM <-> DigitalTwinApp <-> NetworkTwinCanvas
             |                  |
             +-> physics <------+ 
             +-> orchestrator -> DOM/canvas/physics
             +-> battle agents -> canvas node mutation
             +-> multiplayer -> canvas/battle/UI mutation
             +-> tools/CLI -> every subsystem
```

Specific coupling problems:

- Domain entities are the same mutable objects that the renderer and editor use.
- `window.appInstance` is a service locator used throughout scripts and inline HTML.
- UI selectors and template strings are embedded in rules and simulation paths.
- Timers are created in many components without a single lifecycle owner.
- Scenario definitions live inside an application method rather than data files.
- Multiple representations exist for topology, device configuration, battle footholds, alerts, incident timelines, and physical state.
- Save/load snapshots only part of the live state and have no schema version.
- Root browser assets and Android assets are duplicated and already divergent.

### Technical debt

Highest priority debt relevant to BreachVerse:

1. No authority boundary or hidden-information boundary.
2. No deterministic engine; pervasive wall-clock time and unseeded randomness.
3. No normalized domain model for identities, credentials, services, controls, access, observations, or objectives.
4. No automated tests, schemas, type checking, linting, or CI safety net.
5. Monolithic mutable application state and global service locator.
6. Domain logic directly manipulates DOM and Canvas state.
7. HTML-string rendering and inline handlers create maintainability and injection risk.
8. Multiplayer lacks authentication, authorization, idempotency, ordering, reconnection, and concurrency control.
9. Save/load and incident logs are incomplete snapshots rather than versioned replayable events.
10. Hundreds of generated Android artifacts, Gradle cache files, a built APK, and local machine configuration are tracked; there is no root `.gitignore`.
11. Android contains a manually copied, older web application fork.
12. Documentation describes capabilities but not invariants, protocols, or data contracts.

These findings do not require rewriting AETHERIS. They explain why BreachVerse should start in a clean additive boundary.

## 2. Reuse matrix

Classification:

- A — reuse mostly as-is
- B — refactor and reuse
- C — use concept only
- D — replace completely
- E — not relevant to the initial product

| AETHERIS subsystem | Class | Decision and reason |
|---|---:|---|
| Canvas network rendering | C | Preserve visual behavior and art direction, not the DOM/global-bound 3,500-line class. |
| Pan, zoom, selection, drag | C | Requirements and interaction feel transfer; implement through the selected renderer adapter. |
| Node/device objects | C | Flat node fields are a useful seed vocabulary but cannot represent BreachVerse truth or knowledge. |
| Network topology and link data | B | Normalize IDs and extract scenario data into versioned schemas; coordinates and many link concepts can transfer. |
| Dijkstra pathfinding | B | Extract as a pure graph function, add directed/policy-aware reachability, typed weights, and tests. |
| Packet and event trail animations | C | Recreate effect patterns from authoritative observation events; never generate strategic truth in the renderer. |
| Routing helpers / traceroute | C | Useful educational model, but current L2/L3 split and defaults are too ad hoc for the core rules. |
| ACL/firewall configuration | C | Keep policy concepts. Replace string-prefix checks with typed reachability/control rules. |
| DHCP, ARP, DNS, OSPF simulations | C | Possible scenario flavor later; unnecessary detail for the first strategic match. |
| Centralized terminal/system logging | C | Keep feed UX. Replace DOM logging with canonical domain events and player observations. |
| Simulated telemetry / SIEM feed | C | Strong product concept. Telemetry must be generated by engine rules and projected by visibility. |
| Incident timeline | B | Preserve timeline UX and MITRE metadata ideas; source it from immutable events. |
| Lateral movement logic | C | Tactic vocabulary and graph adjacency are useful; automatic compromise and omniscience are not. |
| Red/Blue battle agents | C | Phase names and opponent-strategy ideas can seed future bots. Do not use for resolution. |
| Evolutionary/headless battle engine | C | Headless simulation is the right direction, but current rules are too simplified and non-deterministic. |
| Attack/incident injection logic | C | Scenario beats and telemetry copy are references; replace direct status mutations. |
| Save/load topology | B | Reuse JSON export idea after adding versioned schemas, migration, IDs, and validation. |
| CLI | C | Valuable future analyst/engineering interface; not part of the first BreachVerse match loop. |
| `multiplayer.js` | D | Peer authority and full-state synchronization violate fog-of-war and server authority. |
| `server.py` relay | D | Replace with authoritative match service and WebSockets. |
| Session IDs / heartbeat concepts | C | Keep join-code and presence UX; implement server-issued seat tokens and reconnect semantics. |
| SCADA/HMI/PLC entity vocabulary | B | Extract as future scenario/entity definitions without enabling ICS in MVP. |
| Modbus coil/register mechanics | C | Useful later as typed action/effect rules, not command strings bound to reactor UI. |
| Reactor process physics | B | Extract equations into a pure deterministic plugin, add fixed substeps and tests; defer integration. |
| Water treatment / power grid physics | C | Extension examples only until there is an ICS roadmap. |
| SIS safety interlocks | B | Good rule concepts; model as deterministic controls producing events during fixed-step resolution. |
| IT/OT segmentation | C | Preserve boundary/policy concept; replace link-status mutation with typed network policy. |
| SOAR/playbook mechanics | C | Good Blue-action design source; replace automatic browser mutations with queued server actions. |
| Wireshark synthetic packet UI | C | Potential observation detail view later; not needed for MVP and cannot invent client truth. |
| Packet tracer UI | C | Good path-explanation presentation; rebuild over sanitized engine observations. |
| Device inspector/CVE panels | C | Useful interaction and content reference; rebuild as React components over player views. |
| LLM co-pilot | E | Explicitly out of MVP and must never resolve game outcomes. |
| Existing design system/styles | C | Reuse selected colors, density, and SOC vocabulary; replace the monolithic CSS/inline styles. |
| Android WebView application | E | Browser-native desktop prototype first; remove duplication only in a later AETHERIS maintenance task. |
| GitHub Pages marketing site | E | Separate concern. |

No major subsystem is class A. That is not a negative assessment: AETHERIS is a working integrated prototype, while BreachVerse requires a different trust boundary and execution model.

## Renderer decision

### Recommendation: PixiJS behind an adapter

Do not adopt Phaser for milestone one. Do not transplant `NetworkTwinCanvas` into React.

Use PixiJS because BreachVerse needs a rendering engine and scene graph, not a general game framework. PixiJS provides WebGL/WebGPU renderer selection, a scene hierarchy, pointer events, ticker support, graphics/sprites/text, and render-group optimization while leaving match state, screens, controls, and domain lifecycle in React and the server. Official references: [PixiJS architecture](https://pixijs.com/8.x/guides/concepts/architecture), [application](https://pixijs.com/8.x/guides/components/application), and [events](https://pixijs.com/8.x/guides/components/events).

Phaser provides capable scenes, cameras, input, display lists, tweens, physics, loaders, and other game systems. Those systems overlap with React application lifecycle and are more framework than the network board needs. Official references: [Phaser scenes](https://docs.phaser.io/phaser/concepts/scenes), [input](https://docs.phaser.io/phaser/concepts/input), and [cameras](https://docs.phaser.io/phaser/concepts/cameras).

React Flow is attractive for an editor or scenario authoring tool, but complex DOM nodes and animated edges can become a performance concern at larger graph sizes; its own guidance emphasizes memoization and simplified styling. It is not the preferred main battle renderer. Reference: [React Flow performance](https://reactflow.dev/learn/advanced-use/performance).

The decision should still be validated by a short spike before building the polished board. Exit criteria:

- Render 100 nodes and 180 edges at a stable target frame rate on a modest laptop.
- Pan, zoom, select, and focus with mouse and touch.
- Apply a complete player-view snapshot without recreating the whole scene.
- Animate 30 event trails while preserving input responsiveness.
- Cleanly destroy/recreate the renderer during React development remounts.
- Demonstrate that the renderer receives only `PlayerView`, never `WorldState`.

If the spike fails, a new small plain-Canvas renderer is the fallback. Phaser is appropriate only if BreachVerse later gains scene-heavy animation, audio, asset pipelines, and game-object behaviors that materially exceed PixiJS plus React.

## 3. Proposed BreachVerse architecture

### System view

```text
React/Vite browser
  Match UI + Planner + Event Feed + Pixi Network Board
                 |
          validated WebSocket protocol
                 |
Authoritative TypeScript game server
  Session/seat auth -> command handler -> match coordinator
                                      |
                      pure deterministic engine
                   validate -> resolve -> reduce
                      |                  |
                canonical events    true WorldState
                      |
             visibility projector
              /                 \
         Red PlayerView      Blue PlayerView
                      |
          replay sink + optional snapshots
```

### Frontend

Use React, TypeScript, and Vite for the first prototype. Next.js does not add value to the local match loop: no SEO, server rendering, marketplace, or authenticated web portal is required. If a public site and account platform later need Next.js, they can consume the same protocol and UI packages while the game server remains separate.

Frontend responsibilities:

- Join/create match and claim a role using a server-issued seat token.
- Hold only the latest `PlayerView` plus local UI state.
- Draft a plan locally, submit valid action commands, and lock readiness.
- Render map nodes/edges and observation animations from sanitized view events.
- Display AP, phase, alerts, telemetry, objectives, score, presence, and errors.
- Reconnect using match ID, player ID, seat token, and last acknowledged sequence.
- Never import the engine package and never infer hidden outcomes.

### Authoritative game server

Use a standalone Node.js/TypeScript process. A small HTTP layer handles health checks and local match creation; WebSockets handle match commands and server messages. A minimal `ws`-style transport is sufficient; Socket.IO is not required unless reconnect/fallback features later justify it.

Server responsibilities:

- Own all active `Match` instances and true `WorldState`.
- Issue unguessable per-seat credentials; a human-friendly join code locates a match but does not authorize a seat.
- Validate message schema, protocol version, role, phase, AP, ownership, visibility, target eligibility, and idempotency key.
- Keep both submitted plans secret until resolution.
- Resolve once both occupied seats are ready, or when a future timer policy expires.
- Append canonical events, update world state, evaluate objectives/scoring, and project a separate view for each player.
- Redact errors so target validation cannot be used to enumerate hidden entities.
- Sequence all outbound messages and support snapshot-based reconnect.

### Pure game engine

The engine is a side-effect-free package:

```ts
resolveTurn(input: ResolveTurnInput): ResolveTurnResult
projectView(input: ProjectViewInput): PlayerView
reduceEvent(state: WorldState, event: DomainEvent): WorldState
```

It must not access the DOM, network, file system, current time, environment variables, or global randomness. Inputs include a ruleset version and deterministic RNG seed. Outputs include the next immutable state, ordered canonical events, score changes, objective changes, and a reproducibility hash.

### Turn resolver

Initial resolution pipeline:

1. Freeze both accepted plans and debit reserved AP.
2. Expand actions into typed intents with speed, stage, prerequisites, and effects.
3. Derive deterministic initiative from action speed plus seeded tie-breaking.
4. Resolve stages in order: preparation, access/control changes, movement/containment, collection/exfiltration, recovery/impact, telemetry/detection, objectives/scoring.
5. Re-evaluate prerequisites immediately before each intent so opposing actions interact.
6. Emit an event for every accepted, failed, interrupted, detected, or consequential effect.
7. Reduce events into the next world state.
8. Evaluate terminal conditions.
9. Produce Red and Blue observation streams and new views.

Action order should be explicit game design data, not incidental array order. For example, isolation with higher initiative may cut a lateral movement route; slower isolation may occur after the pivot but still contain the source. The event log records the actual resolution order.

### Fog-of-war engine

Fog is a server projection, not a UI flag.

```ts
projectWorld(world, player, knowledge, canonicalEvents) => {
  view: PlayerView;
  observations: ViewEvent[];
}
```

Rules:

- Undiscovered entities are omitted, not returned with `hidden: true`.
- Known entities contain only fields at the player's current knowledge level.
- Red access and Blue suspicion are separate knowledge tracks.
- Blue can know an asset exists and is operational without knowing Red's access, credentials, or persistence.
- Red can know a service fingerprint without knowing EDR quality, patch truth, honeypot status, or Blue actions.
- Action submission may reference only visible public handles supplied in that player's view.
- Canonical events stay server-side until post-match reveal.
- Post-match replay authorization can switch from side projection to full projection without changing the canonical log.

For the MVP, send a complete sanitized `PlayerView` after phase changes and turn resolution. At 8–12 nodes this is simpler and safer than JSON patches. Add diffs only after measurement.

### Multiplayer communication

Client commands:

```text
CREATE_MATCH
CLAIM_SEAT
SUBMIT_PLAN
SET_READY
UNREADY
REQUEST_SNAPSHOT
PING
```

Server messages:

```text
MATCH_CREATED
SEAT_CLAIMED
PRESENCE_CHANGED
PLAN_ACCEPTED
READY_CHANGED
TURN_RESOLVING
TURN_RESOLVED
PLAYER_VIEW
MATCH_ENDED
ERROR
PONG
```

Every envelope includes `protocolVersion`, `messageId`, `matchId`, and sequence information. Mutating commands include an idempotency key and expected turn/phase. The server is the only source of phase advancement.

### Event and replay model

Use state plus events, not full event sourcing for every implementation detail.

- `WorldState` is the current authoritative snapshot.
- `DomainEvent[]` is the immutable canonical match history.
- `ViewEvent[]` is a redacted projection for one audience.
- A snapshot may be stored at match start and every N turns for fast replay seek.
- Replays are rebuilt with the exact engine/ruleset version that produced them, or played as recorded state deltas when old code is unavailable.

Each canonical event includes match ID, event ID, monotonically increasing sequence, turn, resolution stage, simulation timestamp, event type, actor/targets, typed payload, audience classification, ruleset version, and causal command/action IDs.

Do not store only human-readable messages. UI copy should be derived from typed event payloads so balancing, localization, replays, and analytics remain possible.

### Persistence

Prototype:

- Active matches in server memory.
- Scenario JSON checked into source control.
- Append canonical events to a versioned JSONL replay file through a `ReplayStore` interface.
- Optional snapshot JSON written only at match end.

Later:

- PostgreSQL for users, scenarios, matches, seats, canonical events, snapshots, and scores.
- Redis only if multiple game-server processes or expiring distributed match ownership becomes necessary.

The engine and coordinator should depend on repository interfaces so persistence can change without changing rules.

## 4. Suggested repository structure

Add this without moving current AETHERIS files:

```text
AETHERIS-SIMULATOR/
├── app.js, index.html, network-canvas.js, ...   # preserved AETHERIS
├── docs/
│   └── BREACHVERSE_ARCHITECTURE_ASSESSMENT.md
└── breachverse/
    ├── package.json                 # workspace scripts only
    ├── tsconfig.base.json
    ├── apps/
    │   ├── web/
    │   │   └── src/
    │   │       ├── app/
    │   │       ├── features/lobby/
    │   │       ├── features/match/
    │   │       ├── features/planner/
    │   │       ├── features/event-feed/
    │   │       ├── features/network-map/
    │   │       │   ├── NetworkMap.tsx
    │   │       │   ├── PixiNetworkRenderer.ts
    │   │       │   └── renderer-types.ts
    │   │       ├── state/
    │   │       └── transport/
    │   └── game-server/
    │       └── src/
    │           ├── http/
    │           ├── websocket/
    │           ├── auth/
    │           ├── matches/
    │           ├── persistence/
    │           └── main.ts
    ├── packages/
    │   ├── domain/                  # IDs and domain types; no runtime authority
    │   ├── protocol/                # client-safe DTOs and runtime schemas
    │   ├── engine/                  # server-only deterministic rules
    │   │   └── src/
    │   │       ├── actions/
    │   │       ├── detection/
    │   │       ├── fog/
    │   │       ├── graph/
    │   │       ├── objectives/
    │   │       ├── replay/
    │   │       ├── rng/
    │   │       ├── scoring/
    │   │       └── turns/
    │   ├── scenarios/               # schemas, loader, enterprise MVP JSON
    │   └── test-kit/                # deterministic builders and fixtures
    ├── replays/                     # ignored local development output
    └── docs/
        ├── protocol.md
        ├── rules.md
        └── threat-model.md
```

Avoid Nx, Turborepo, microservices, Kubernetes, and a shared client/server state store. Workspace scripts and TypeScript project references are enough.

`domain` may be imported by the engine, server, scenarios, and protocol. `engine` may be imported only by the server, engine tests, and offline balance tools. The browser imports `protocol`, never `engine`.

## 5. Initial data model

These are direction-setting TypeScript shapes, not a final schema. IDs are branded strings in implementation. Maps may serialize as records over the wire.

```ts
type Team = "RED" | "BLUE";
type MatchPhase =
  | "LOBBY"
  | "OBSERVATION"
  | "PLANNING"
  | "LOCKED"
  | "RESOLVING"
  | "ENDED";

interface Match {
  id: MatchId;
  joinCode: string;
  scenarioId: ScenarioId;
  rulesetVersion: string;
  seed: string;
  phase: MatchPhase;
  currentTurn: number;
  players: Record<PlayerId, Player>;
  seats: Partial<Record<Team, PlayerId>>;
  world: WorldState;                 // server-only
  visibility: Record<PlayerId, VisibilityState>;
  turn: Turn;
  objectives: Record<ObjectiveId, Objective>;
  score: Score;
  nextEventSequence: number;
  winner?: Team;
  endReason?: string;
}

interface Player {
  id: PlayerId;
  team: Team;
  connection: "CONNECTED" | "DISCONNECTED";
  seatTokenHash: string;             // server-only; raw token never stored
  lastSeenAt: string;
  lastAckedSequence: number;
}

interface WorldState {
  version: number;
  simulationMinute: number;
  nodes: Record<NodeId, Node>;
  identities: Record<IdentityId, Identity>;
  credentials: Record<CredentialId, Credential>;
  networks: Record<NetworkId, Network>;
  edges: Record<EdgeId, NetworkEdge>;
  services: Record<ServiceId, Service>;
  controls: Record<ControlId, SecurityControl>;
  businessServices: Record<BusinessServiceId, BusinessService>;
  redState: RedOperationalState;
  blueState: BlueOperationalState;
  alerts: Record<AlertId, Alert>;
}

interface Node {
  id: NodeId;
  kind: "INTERNET" | "FIREWALL" | "ROUTER" | "SWITCH" |
        "SERVER" | "WORKSTATION" | "DOMAIN_CONTROLLER" | "CLOUD" |
        "HMI" | "PLC" | "FIELD_DEVICE";
  name: string;
  networkIds: NetworkId[];
  serviceIds: ServiceId[];
  controlIds: ControlId[];
  businessServiceIds: BusinessServiceId[];
  platform: string;
  patchLevel: number;                // 0..100 truth
  criticality: number;               // 0..100
  availability: "ONLINE" | "DEGRADED" | "OFFLINE" | "ISOLATED";
  position: { x: number; y: number };
  tags: string[];
}

interface Identity {
  id: IdentityId;
  displayName: string;
  kind: "HUMAN" | "SERVICE" | "MACHINE";
  privilege: "USER" | "LOCAL_ADMIN" | "DOMAIN_ADMIN" | "SERVICE";
  groupIds: string[];
  usesNodeIds: NodeId[];
  enabled: boolean;
  monitoringLevel: number;
}

interface Credential {
  id: CredentialId;
  identityId: IdentityId;
  kind: "PASSWORD" | "HASH" | "TOKEN" | "KEY" | "TICKET";
  privilege: Identity["privilege"];
  validOnNodeIds: NodeId[];
  validOnNetworkIds: NetworkId[];
  active: boolean;
  rotationVersion: number;
  exposure: "SECRET" | "EXPOSED" | "REVOKED";
  // No real password or exploit material is stored.
}

interface Network {
  id: NetworkId;
  name: string;
  zone: "INTERNET" | "DMZ" | "CORP" | "SERVER" | "MANAGEMENT" | "OT";
  nodeIds: NodeId[];
  defaultTrust: number;
}

interface NetworkEdge {
  id: EdgeId;
  from: NodeId | NetworkId;
  to: NodeId | NetworkId;
  direction: "ONE_WAY" | "BIDIRECTIONAL";
  policyIds: string[];
  state: "UP" | "BLOCKED" | "DOWN";
}

interface ActionDefinition {
  id: ActionType;
  team: Team;
  name: string;
  apCost: number;
  speed: number;
  noise: number;
  targetKinds: string[];
  prerequisites: string[];
  resolver: string;                  // registry key, not executable scenario text
  mitreTechniqueIds?: string[];
}

interface PlannedAction {
  id: ActionId;
  definitionId: ActionType;
  playerId: PlayerId;
  turnNumber: number;
  target: VisibleEntityRef;
  parameters: Record<string, string | number | boolean>;
  apCost: number;
  submittedOrder: number;
}

interface DomainEvent<T = unknown> {
  id: EventId;
  matchId: MatchId;
  sequence: number;
  turnNumber: number;
  simulationMinute: number;
  stage: ResolutionStage;
  type: string;
  actor?: EntityRef;
  targets: EntityRef[];
  payload: T;
  causedByCommandId?: string;
  causedByActionId?: ActionId;
  audience: "SERVER_ONLY" | "RED" | "BLUE" | "BOTH" | "POST_MATCH";
  rulesetVersion: string;
}

interface Alert {
  id: AlertId;
  createdTurn: number;
  sourceNodeId?: NodeId;             // truth; projection may omit or generalize
  category: "AUTH" | "ENDPOINT" | "NETWORK" | "EMAIL" | "DLP" | "OT";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  summaryCode: string;
  evidenceRefs: EventId[];
  status: "NEW" | "INVESTIGATING" | "CLOSED_TRUE" | "CLOSED_FALSE";
}

type KnowledgeLevel = "UNKNOWN" | "DISCOVERED" | "IDENTIFIED" | "PROFILED" | "CONFIRMED";

interface EntityKnowledge {
  entityRef: EntityRef;
  level: KnowledgeLevel;
  knownFields: Record<string, unknown>;
  confidence: number;
  learnedFrom: EventId[];
  lastObservedTurn: number;
}

interface VisibilityState {
  playerId: PlayerId;
  entities: Record<string, EntityKnowledge>;
  visibleAlertIds: AlertId[];
  visibleEventSequence: number;
}

interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  team: Team;
  phase: MatchPhase;
  turnNumber: number;
  simulationMinute: number;
  availableAp: number;
  ownPlan: PlannedAction[];
  opponentReady: boolean;
  entities: VisibleEntity[];
  edges: VisibleEdge[];
  alerts: VisibleAlert[];
  observations: ViewEvent[];
  objectives: VisibleObjective[];
  score: VisibleScore;
  viewVersion: number;
}

interface Objective {
  id: ObjectiveId;
  owner: Team;
  type: "EXFILTRATE" | "CONTAIN" | "PROTECT" | "SURVIVE" | "IMPACT";
  state: "HIDDEN" | "ACTIVE" | "SUCCEEDED" | "FAILED";
  targetRefs: EntityRef[];
  parameters: Record<string, number | string | boolean>;
  points: number;
}

interface Turn {
  number: number;
  phase: MatchPhase;
  apBudget: Record<Team, number>;
  plans: Partial<Record<Team, PlannedAction[]>>; // server-only
  ready: Record<Team, boolean>;
  openedAt: string;
  lockedAt?: string;
  resolvedAt?: string;
  resolutionSeed?: string;
  firstEventSequence?: number;
  lastEventSequence?: number;
  stateHashBefore?: string;
  stateHashAfter?: string;
}

interface Score {
  total: Record<Team, number>;
  categories: Record<Team, {
    objectives: number;
    intelligence: number;
    accessOrContainment: number;
    stealthOrBusinessContinuity: number;
    penalties: number;
  }>;
  changes: Array<{
    eventId: EventId;
    team: Team;
    amount: number;
    reasonCode: string;
  }>;
}
```

`RedOperationalState` should separately map access, privilege, persistence, collected data, exfiltration progress, and held credential IDs. `BlueOperationalState` should map investigations, deployed detections, containment policies, evidence preservation, monitoring levels, and hypotheses. Neither belongs as a single status on `Node`.

## 6. First playable prototype plan

### Milestone 0 — Architecture baseline (this document)

Purpose: establish boundaries and prevent accidental AETHERIS rewrite.

Files/modules:

- `docs/BREACHVERSE_ARCHITECTURE_ASSESSMENT.md`

Acceptance criteria:

- AETHERIS runtime files are unchanged.
- Reuse decisions, authority model, fog boundary, models, and milestones are reviewed before coding.

Tests:

- Existing JavaScript and Python syntax checks continue to pass.

### Milestone 1 — Workspace and contracts

Purpose: create a typed, testable skeleton with no gameplay UI.

Files/modules:

- `breachverse/apps/web`
- `breachverse/apps/game-server`
- `breachverse/packages/domain`
- `breachverse/packages/protocol`
- `breachverse/packages/engine`
- `breachverse/packages/scenarios`

Acceptance criteria:

- One command runs typecheck and unit tests across the workspace.
- Web app connects to server health endpoint.
- Protocol schemas reject unknown message versions and invalid payloads.
- Browser build cannot import the engine package.

Tests:

- Type-level/project-boundary checks.
- Protocol schema round trips and malformed message rejection.
- Server smoke test.

### Milestone 2 — Deterministic enterprise engine vertical slice

Purpose: prove the rules engine before multiplayer visuals.

Files/modules:

- `engine/src/rng`
- `engine/src/graph`
- `engine/src/actions`
- `engine/src/turns`
- `engine/src/events`
- `scenarios/enterprise-small.json`

Initial scenario:

- Internet, edge firewall, corporate network, domain controller, file server, and four workstations.
- Five to eight users, several credentials, EDR on selected hosts, and one protected dataset.
- Start with six AP and a deliberately small action set: four Red actions and four Blue actions.

Acceptance criteria:

- Two plans resolve simultaneously from a seed with no DOM or server dependency.
- Same state, plans, ruleset, and seed produce byte-equivalent ordered events and the same state hash.
- Access, identity compromise, credential ownership, host compromise, and isolation remain distinct.
- Reachability changes can interrupt movement.

Tests:

- Determinism golden test.
- AP and prerequisite validation.
- Graph reachability and isolation tests.
- Credential-vs-host access separation tests.
- Conflicting action ordering tests.

### Milestone 3 — Authoritative two-seat match server

Purpose: make the server the only authority.

Files/modules:

- `game-server/src/matches/MatchCoordinator.ts`
- `game-server/src/websocket`
- `game-server/src/auth/SeatTokens.ts`
- `game-server/src/persistence/InMemoryMatchRepository.ts`
- `game-server/src/persistence/JsonlReplayStore.ts`

Acceptance criteria:

- Create a match, claim exactly one Red and one Blue seat, reconnect, submit plans, and ready both players.
- Server validates and resolves exactly once per turn.
- Duplicate commands are idempotent.
- A client cannot act for the other role or resolve a turn.
- Disconnection does not expose or discard the locked plan.

Tests:

- WebSocket integration test with two clients.
- Seat hijack and role spoof rejection.
- Duplicate ready/plan command test.
- Reconnect snapshot test.
- Invalid phase/turn/AP rejection.

### Milestone 4 — Fog-of-war projections

Purpose: enforce the defining product constraint before map work.

Files/modules:

- `engine/src/fog/projectView.ts`
- `engine/src/fog/projectEvent.ts`
- `protocol/src/player-view.ts`
- `docs/threat-model.md`

Acceptance criteria:

- Red initially receives only its entry knowledge and public perimeter observations.
- Blue receives inventory/health appropriate to the scenario but no Red access or hidden persistence.
- Undiscovered entity names, IDs, services, controls, and events do not appear anywhere in Red payloads.
- Opponent plans remain secret through planning and lock.
- Post-match full replay is derived from the canonical event log.

Tests:

- Snapshot tests for Red, Blue, observer, and post-match projections.
- Recursive forbidden-field scan over serialized client payloads.
- Hidden-target enumeration and error-redaction tests.
- Alert ambiguity tests: telemetry does not directly name the Red action unless rules justify attribution.

### Milestone 5 — Playable web shell and renderer spike

Purpose: visualize sanitized player views and validate PixiJS.

Files/modules:

- `web/src/features/lobby`
- `web/src/features/match`
- `web/src/features/network-map`
- `web/src/state`
- `web/src/transport`

Acceptance criteria:

- Two browser windows join the same local match and select opposite roles.
- The board renders only the nodes/edges in each `PlayerView`.
- Pan, zoom, selection, status rings, and one observation trail work.
- A 100-node synthetic view meets the agreed performance target.
- React remount does not leak canvases, event handlers, or animation loops.

Tests:

- Component tests for role/lobby/error states.
- Renderer adapter tests with a fake implementation.
- Browser test comparing Red and Blue visible node lists.
- Performance smoke benchmark and renderer cleanup test.

### Milestone 6 — Action planner and repeated simultaneous turns

Purpose: complete the core human-vs-human loop.

Files/modules:

- `web/src/features/planner`
- `web/src/features/turn-status`
- expanded `engine/src/actions`
- expanded protocol command handlers

Acceptance criteria:

- Each side sees six AP, queues/reorders/removes valid actions, submits, and clicks Ready.
- Each player sees its own plan but never the opponent plan.
- Server resolves after both are ready and starts the next observation/planning phase.
- Invalidated actions produce understandable sanitized results.
- The loop repeats without refreshing either browser.

Tests:

- Planner AP and target eligibility tests.
- End-to-end two-browser turn test.
- Simultaneous conflict cases: isolate vs lateral move, reset vs credential use, hunt vs stealthy action.
- Ready/unready and plan revision tests.

### Milestone 7 — Detection, objectives, scoring, and replay

Purpose: turn the loop into a complete match.

Files/modules:

- `engine/src/detection`
- `engine/src/objectives`
- `engine/src/scoring`
- `engine/src/replay`
- `web/src/features/event-feed`
- `web/src/features/match-end`

Acceptance criteria:

- Expand toward 8–12 meaningful actions per team.
- Red can discover, gain access, obtain/use credentials, move laterally, collect, and exfiltrate.
- Blue can investigate, hunt, isolate, disable/reset, block, deploy detection, and restore.
- Noise/control quality deterministically produces telemetry through seeded rules.
- Red wins by exfiltrating protected data; Blue wins by confirmed containment before exfiltration.
- Full post-match replay reveals the canonical timeline; side replay remains filtered.

Tests:

- Detection probability boundary and seeded outcome tests.
- Objective and scoring tests.
- Complete Red-win and Blue-win scripted matches.
- Replay hash/rebuild test and event schema compatibility test.

### Milestone 8 — Balance and presentation pass

Purpose: make the small match understandable and fun before adding scope.

Files/modules:

- Scenario/action tuning data.
- Network-map effects and accessibility settings.
- Event copy catalog.
- Developer balance harness.

Acceptance criteria:

- New players can understand legal targets, AP costs, noise, likely impact, observations, and win progress.
- Effects communicate important events without pretending to render packets.
- Reduced-motion and keyboard-friendly controls work.
- Scripted/random legal agents can run many headless matches for balance statistics without affecting authoritative rules.

Tests:

- Accessibility checks.
- Headless batch invariants: no negative AP, impossible references, double resolution, or matches stuck outside configured limits.
- UI regression screenshots for both teams and match end.

## 7. Risks and decisions to settle

### Decisions recommended now

| Decision | Recommendation |
|---|---|
| Engine/server language | TypeScript end to end. Shared types and one toolchain outweigh Python's benefits for this deterministic MVP. |
| Browser framework | React + Vite now. Reconsider Next.js only for a later account/content platform. |
| Board renderer | PixiJS after a bounded spike. Keep it behind `NetworkRenderer`. |
| Authority | Dedicated game server, never a browser host. |
| Transport | WebSockets for commands/messages; HTTP only for health and initial match creation if useful. |
| Match persistence | Memory plus JSONL replay interface for prototype; PostgreSQL later. |
| Client update format | Full sanitized snapshots after meaningful transitions; optimize to patches later. |
| Randomness | Seeded engine-owned PRNG; no `Math.random` or wall clock in rules. |
| ICS scope | Design plugin boundary now; do not implement ICS in the first playable scenario. |

### Product/rules unknowns requiring design choices

1. Exact action resolution stages and speed semantics. This is the most important gameplay rule to prototype early.
2. Whether planning has a timer in milestone one. Recommendation: no timer initially; add after local testing.
3. What Blue knows at match start: full inventory, managed inventory only, or confidence-based asset inventory.
4. Whether Red can act against a partially known target and how uncertainty affects action cost/outcome.
5. How detection sensitivity, attacker stealth, noise, sensor coverage, and false positives combine without becoming opaque.
6. How much outcome probability is desirable. Deterministic replay can still use seeded probability, but players need readable expectations.
7. Whether isolation immediately stops business services and how business impact influences Blue score.
8. Whether credentials are reusable capabilities, consumable tokens, or both.
9. What constitutes “identify and contain the attacker” for the Blue win: all footholds, the active exfiltration path, or an attribution threshold.
10. Whether match replay must remain executable forever or may fall back to recorded view/state deltas across ruleset upgrades.

### Engineering risks

- **Fog leaks through metadata:** error messages, stable hidden IDs, action target lists, counts, payload sizes, and timing can leak truth. Projection and protocol tests must be treated as security tests.
- **Engine/view coupling:** sharing TypeScript types can accidentally expose server-only fields. Use explicit client DTOs and package import boundaries rather than serializing domain objects.
- **Non-determinism:** timestamps, unordered object iteration, floating-point drift, and incidental RNG calls can break replay. Centralize RNG, ordering, time, and state hashing.
- **Event schema churn:** events are a long-lived replay API. Version events and rulesets from the first prototype, but avoid designing a universal event framework.
- **Resolution complexity:** too many action interactions will slow the first fun build. Begin with eight total actions, prove the loop, then expand to the requested 8–12 per side.
- **Renderer distraction:** visual polish can consume the schedule. Keep map rendering downstream of `PlayerView` and finish the text/headless turn loop first.
- **Premature infrastructure:** PostgreSQL and Redis can distract from rules and fog correctness. Repository interfaces are enough until persistence is actually needed.
- **AETHERIS regression:** moving root files or deduplicating Android now risks breaking the original. Keep BreachVerse additive during the prototype.

## Stop point and approval gate

No BreachVerse code should be scaffolded and no AETHERIS subsystem should be moved until this assessment is reviewed.

On approval, the next action should be milestone 1 only: create the additive TypeScript workspace, enforce package boundaries, define protocol schemas, and add test/typecheck scripts. It should not yet implement the polished map, full action catalog, ICS mode, AI opponents, LLM features, PostgreSQL, or Redis.
