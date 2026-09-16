import { z } from "zod";
import type { PlayerView, Team } from "@breachverse/domain";

export type {
  ActionDefinition,
  ActionType,
  AvailableAction,
  MatchPhase,
  PlannedAction,
  PlayerView,
  Team,
  ViewEvent,
  VisibleEdge,
  VisibleIdentity,
  VisibleNode,
} from "@breachverse/domain";

export const PROTOCOL_VERSION = 1 as const;

const teamSchema = z.enum(["RED", "BLUE"]);
const actionTypeSchema = z.enum([
  "RECON_NODE",
  "SCAN_SERVICE",
  "CREDENTIAL_ATTACK",
  "GAIN_FOOTHOLD",
  "LATERAL_MOVEMENT",
  "EXFILTRATE_DATA",
  "INVESTIGATE_NODE",
  "INCREASE_MONITORING",
  "ISOLATE_NODE",
  "DISABLE_ACCOUNT",
  "THREAT_HUNT",
]);

const plannedActionSchema = z.object({
  id: z.string().min(1).max(80),
  type: actionTypeSchema,
  targetNodeId: z.string().min(1).max(80),
  order: z.number().int().min(0).max(20),
}).strict();

const baseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1).max(80),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  baseSchema.extend({ type: z.literal("create_match"), role: teamSchema }).strict(),
  baseSchema.extend({ type: z.literal("join_match"), code: z.string().trim().min(4).max(8), role: teamSchema }).strict(),
  baseSchema.extend({ type: z.literal("submit_plan"), turn: z.number().int().positive(), actions: z.array(plannedActionSchema).max(8) }).strict(),
  baseSchema.extend({ type: z.literal("set_ready"), turn: z.number().int().positive() }).strict(),
  baseSchema.extend({ type: z.literal("request_snapshot") }).strict(),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "connected"; protocolVersion: typeof PROTOCOL_VERSION }
  | { type: "session_joined"; requestId: string; role: Team; matchCode: string; view: PlayerView }
  | { type: "player_view"; reason: "presence" | "plan" | "ready" | "resolution" | "snapshot"; view: PlayerView }
  | { type: "error"; requestId: string | null; code: string; message: string };

export function parseClientMessage(input: unknown): ClientMessage {
  return clientMessageSchema.parse(input);
}

export function safeParseClientMessage(input: unknown): ReturnType<typeof clientMessageSchema.safeParse> {
  return clientMessageSchema.safeParse(input);
}
