export type Team = "RED" | "BLUE";
export type MatchPhase = "LOBBY" | "PLANNING" | "RESOLVING" | "ENDED";
export type NodeId = string;
export type IdentityId = string;
export type CredentialId = string;

export type NodeKind =
  | "INTERNET"
  | "FIREWALL"
  | "SWITCH"
  | "DOMAIN_CONTROLLER"
  | "SERVER"
  | "WORKSTATION";

export type AccessLevel = "NONE" | "USER" | "ADMIN";

export interface Service {
  id: string;
  name: string;
  port: number;
  exposed: boolean;
  vulnerable: boolean;
}

export interface NodeState {
  id: NodeId;
  name: string;
  kind: NodeKind;
  platform: string;
  services: Service[];
  vulnerability: number;
  patchLevel: number;
  edrCoverage: number;
  detectionSensitivity: number;
  monitoring: number;
  compromised: boolean;
  accessLevel: AccessLevel;
  isolated: boolean;
  containsProtectedData: boolean;
  position: { x: number; y: number };
}

export interface NetworkEdge {
  id: string;
  from: NodeId;
  to: NodeId;
}

export interface IdentityState {
  id: IdentityId;
  name: string;
  department: string;
  privilege: "USER" | "HELP_DESK" | "ADMIN";
  nodeIds: NodeId[];
  enabled: boolean;
}

export interface CredentialState {
  id: CredentialId;
  identityId: IdentityId;
  nodeIds: NodeId[];
  active: boolean;
}

export interface RedState {
  discoveredNodeIds: NodeId[];
  scannedNodeIds: NodeId[];
  footholdNodeIds: NodeId[];
  credentialIds: CredentialId[];
  exfiltrated: boolean;
}

export interface BlueState {
  investigatedNodeIds: NodeId[];
  identifiedFootholdNodeIds: NodeId[];
  intrusionIdentified: boolean;
  containmentOccurred: boolean;
}

export interface WorldState {
  nodes: Record<NodeId, NodeState>;
  edges: NetworkEdge[];
  identities: Record<IdentityId, IdentityState>;
  credentials: Record<CredentialId, CredentialState>;
  red: RedState;
  blue: BlueState;
}

export type RedActionType =
  | "RECON_NODE"
  | "SCAN_SERVICE"
  | "CREDENTIAL_ATTACK"
  | "GAIN_FOOTHOLD"
  | "LATERAL_MOVEMENT"
  | "EXFILTRATE_DATA";

export type BlueActionType =
  | "INVESTIGATE_NODE"
  | "INCREASE_MONITORING"
  | "ISOLATE_NODE"
  | "DISABLE_ACCOUNT"
  | "THREAT_HUNT";

export type ActionType = RedActionType | BlueActionType;

export interface ActionDefinition {
  id: ActionType;
  team: Team;
  name: string;
  description: string;
  cost: number;
  speed: number;
  noise: number;
}

export interface PlannedAction {
  id: string;
  type: ActionType;
  targetNodeId: NodeId;
  order: number;
}

export type AuthoritativeEventType =
  | "RECON_COMPLETED"
  | "SERVICE_SCAN_COMPLETED"
  | "CREDENTIAL_ATTACKED"
  | "FOOTHOLD_ATTEMPTED"
  | "LATERAL_MOVEMENT"
  | "DATA_EXFILTRATION"
  | "NODE_INVESTIGATED"
  | "MONITORING_INCREASED"
  | "NODE_ISOLATED"
  | "ACCOUNT_DISABLED"
  | "THREAT_HUNTED"
  | "TELEMETRY_GENERATED"
  | "TURN_RESOLVED"
  | "MATCH_ENDED";

export interface AuthoritativeEvent {
  id: string;
  matchId: string;
  sequence: number;
  turn: number;
  type: AuthoritativeEventType;
  actor: Team | "SYSTEM";
  actionId: string | null;
  sourceNodeId: NodeId | null;
  targetNodeId: NodeId | null;
  identityId: IdentityId | null;
  success: boolean | null;
  detected: boolean | null;
  detailCode: string;
}

export interface ScoreState {
  RED: number;
  BLUE: number;
}

export interface ResolveTurnInput {
  matchId: string;
  seed: number;
  turn: number;
  world: WorldState;
  plans: Record<Team, PlannedAction[]>;
  startingSequence: number;
}

export interface ResolveTurnResult {
  world: WorldState;
  events: AuthoritativeEvent[];
  scoreDelta: ScoreState;
  winner: Team | null;
  endReason: string | null;
}

export interface MatchRecord {
  id: string;
  code: string;
  seed: number;
  turn: number;
  phase: MatchPhase;
  world: WorldState;
  plans: Record<Team, PlannedAction[]>;
  ready: Record<Team, boolean>;
  occupied: Record<Team, boolean>;
  events: AuthoritativeEvent[];
  score: ScoreState;
  winner: Team | null;
  endReason: string | null;
  nextSequence: number;
}

export type VisibleNodeStatus = "UNKNOWN" | "HEALTHY" | "SUSPICIOUS" | "ISOLATED" | "ACCESS" | "CONFIRMED";

export interface VisibleNode {
  id: NodeId;
  name: string;
  kind: NodeKind;
  position: { x: number; y: number };
  knowledge: "DISCOVERED" | "SCANNED" | "MANAGED";
  status: VisibleNodeStatus;
  reachable: boolean;
  platform: string | null;
  services: Array<{ name: string; port: number }>;
  edrEnabled: boolean | null;
  patchLevel: number | null;
  monitoring: number | null;
}

export interface VisibleEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  state: "UP" | "BLOCKED";
}

export interface VisibleIdentity {
  id: IdentityId;
  name: string;
  department: string;
  privilege: string;
  enabled: boolean;
}

export interface ViewEvent {
  id: string;
  sequence: number;
  turn: number;
  tone: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
  category: "INTEL" | "ACTION" | "ALERT" | "SYSTEM";
  message: string;
  nodeId: NodeId | null;
}

export interface AvailableAction extends ActionDefinition {
  eligibleTargetIds: NodeId[];
}

export interface PlayerView {
  matchId: string;
  matchCode: string;
  seed: number;
  role: Team;
  turn: number;
  turnLimit: number;
  phase: MatchPhase;
  apBudget: number;
  apRemaining: number;
  ownReady: boolean;
  opponentReady: boolean;
  opponentConnected: boolean;
  ownPlan: PlannedAction[];
  nodes: VisibleNode[];
  edges: VisibleEdge[];
  identities: VisibleIdentity[];
  availableActions: AvailableAction[];
  events: ViewEvent[];
  score: ScoreState;
  objective: string;
  winner: Team | null;
  endReason: string | null;
}
