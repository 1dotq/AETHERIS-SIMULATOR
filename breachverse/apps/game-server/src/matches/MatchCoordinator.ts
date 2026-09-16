import { randomInt } from "node:crypto";
import type { MatchRecord, PlannedAction, PlayerView, Team } from "@breachverse/domain";
import { projectWorld, resolveTurn, validatePlan } from "@breachverse/engine";
import { createInitialWorld } from "@breachverse/scenarios";

export class MatchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface ReadyResult {
  match: MatchRecord;
  resolved: boolean;
}

interface CoordinatorOptions {
  codeFactory?: () => string;
  seedFactory?: () => number;
  debug?: boolean;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  return Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join("");
}

export class MatchCoordinator {
  private readonly matches = new Map<string, MatchRecord>();
  private readonly codeFactory: () => string;
  private readonly seedFactory: () => number;
  private readonly debug: boolean;

  constructor(options: CoordinatorOptions = {}) {
    this.codeFactory = options.codeFactory ?? randomCode;
    this.seedFactory = options.seedFactory ?? (() => randomInt(1, 0x7fff_ffff));
    this.debug = options.debug ?? false;
  }

  createMatch(role: Team): MatchRecord {
    let code = this.codeFactory().toUpperCase();
    while (this.matches.has(code)) code = this.codeFactory().toUpperCase();
    const seed = this.seedFactory();
    const match: MatchRecord = {
      id: `MATCH-${code}`,
      code,
      seed,
      turn: 1,
      phase: "LOBBY",
      world: createInitialWorld(),
      plans: { RED: [], BLUE: [] },
      ready: { RED: false, BLUE: false },
      occupied: { RED: role === "RED", BLUE: role === "BLUE" },
      events: [],
      score: { RED: 0, BLUE: 0 },
      winner: null,
      endReason: null,
      nextSequence: 1,
    };
    this.matches.set(code, match);
    this.log(match, `created; ${role} seat claimed`);
    return match;
  }

  joinMatch(rawCode: string, role: Team): MatchRecord {
    const match = this.getMatch(rawCode);
    if (match.occupied[role]) throw new MatchError("ROLE_TAKEN", `${role} is already occupied.`);
    match.occupied[role] = true;
    if (match.occupied.RED && match.occupied.BLUE && match.phase === "LOBBY") match.phase = "PLANNING";
    this.log(match, `${role} joined`);
    return match;
  }

  leaveMatch(rawCode: string, role: Team): MatchRecord | null {
    const match = this.matches.get(rawCode.toUpperCase());
    if (!match) return null;
    match.occupied[role] = false;
    match.ready[role] = false;
    if (match.phase !== "ENDED") match.phase = "LOBBY";
    this.log(match, `${role} disconnected`);
    return match;
  }

  submitPlan(rawCode: string, role: Team, turn: number, actions: PlannedAction[]): MatchRecord {
    const match = this.getMatch(rawCode);
    if (match.phase !== "PLANNING") throw new MatchError("NOT_PLANNING", "The match is not accepting plans.");
    if (match.turn !== turn) throw new MatchError("STALE_TURN", "The submitted turn is no longer current.");
    if (match.ready[role]) throw new MatchError("PLAN_LOCKED", "The plan cannot be changed after READY.");
    const validation = validatePlan(match.world, role, actions);
    if (!validation.ok) throw new MatchError(validation.error ?? "INVALID_PLAN", "The plan is not valid for the current player view.");
    match.plans[role] = actions.map((action, index) => ({ ...action, order: index }));
    this.log(match, `${role.toLowerCase()} actions: ${actions.length}`);
    return match;
  }

  setReady(rawCode: string, role: Team, turn: number): ReadyResult {
    const match = this.getMatch(rawCode);
    if (match.phase !== "PLANNING") throw new MatchError("NOT_PLANNING", "The match is not accepting READY.");
    if (match.turn !== turn) throw new MatchError("STALE_TURN", "The submitted turn is no longer current.");
    if (match.ready[role]) throw new MatchError("ALREADY_READY", "This side is already ready.");
    match.ready[role] = true;
    this.log(match, `${role} locked`);

    if (!match.occupied.RED || !match.occupied.BLUE || !match.ready.RED || !match.ready.BLUE) {
      return { match, resolved: false };
    }

    match.phase = "RESOLVING";
    const resolvingTurn = match.turn;
    const result = resolveTurn({
      matchId: match.id,
      seed: match.seed,
      turn: match.turn,
      world: match.world,
      plans: match.plans,
      startingSequence: match.nextSequence,
    });
    match.world = result.world;
    match.events.push(...result.events);
    match.nextSequence += result.events.length;
    match.score.RED += result.scoreDelta.RED;
    match.score.BLUE += result.scoreDelta.BLUE;
    match.winner = result.winner;
    match.endReason = result.endReason;

    if (match.winner) {
      match.phase = "ENDED";
    } else {
      match.turn += 1;
      match.plans = { RED: [], BLUE: [] };
      match.ready = { RED: false, BLUE: false };
      match.phase = "PLANNING";
    }

    this.log(match, `turn ${resolvingTurn} resolution complete; events: ${result.events.length}`);
    if (this.debug) {
      console.dir({
        match: match.code,
        seed: match.seed,
        turn: resolvingTurn,
        world: match.world,
        canonicalEvents: result.events,
      }, { depth: null });
    }
    return { match, resolved: true };
  }

  viewFor(match: MatchRecord, role: Team): PlayerView {
    return projectWorld(match, role);
  }

  getMatch(rawCode: string): MatchRecord {
    const match = this.matches.get(rawCode.toUpperCase());
    if (!match) throw new MatchError("MATCH_NOT_FOUND", "No active match was found for that code.");
    return match;
  }

  private log(match: MatchRecord, message: string): void {
    console.log(`[${match.code}] seed=${match.seed} turn=${match.turn} ${message}`);
  }
}

