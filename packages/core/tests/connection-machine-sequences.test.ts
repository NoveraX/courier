/**
 * The connection's state machine under random sequences of what can happen
 * to a connection: sockets that open, close and fall silent, credentials
 * that come late or never, a server that refuses, an application that
 * reconnects and closes at any moment, a server of another version that
 * answers in its own frames. Whatever the order, it keeps one socket at a
 * time, is open only once admitted, sends its credentials only on an open
 * socket, stays closed once closed, and lets no page's signal bring it back
 * before a wait its server asked for is over.
 *
 * Sequences come from a seeded generator; a failure names its seed, and the
 * same seed replays it.
 */
import { describe, expect, it } from "vitest";

import { transition } from "../src/realtime/ws/connection-machine";
import type {
  MachineContext,
  MachineEvent,
  MachineState,
} from "../src/realtime/ws/connection-machine-types";

/* mulberry32: a small, fast generator whose sequence a seed fixes. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Socket = "none" | "opening" | "open";

const CODES = [
  ...[1000, 1001, 1002, 1006, 1009, 1011, 1012, 1013],
  ...[4000, 4100, 4401, 4403, 4408, 4409, 4429],
];

/* What can happen next, given the socket the machine has: the world only does what it can. */
function nextEvent(random: () => number, state: MachineState, socket: Socket): MachineEvent {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const world: MachineEvent[] = [
    { type: "reconnect" },
    { type: "close" },
    { type: "resume", signal: pick(["online", "visible", "pageshow", "focus"] as const) },
    { type: "renewal-requested" },
    { type: "credentials", fingerprint: pick(["f1", "f2", "f3"]) },
    { type: "credentials-failed", error: new Error("token service down") },
  ];
  if (socket === "opening") world.push({ type: "socket-open" });
  if (socket !== "none") {
    const closure = {
      code: pick(CODES),
      reason: "",
      ...(random() < 0.3 && { retryAfterMs: 500 }),
      ...(random() < 0.3 && { version: pick([1, 2, 3]) }),
    };
    world.push({ type: "closed", closure, announced: random() < 0.5 });
    world.push(
      {
        type: "admitted",
        connectionId: "c1",
        heartbeat: { intervalMs: 25_000, timeoutMs: 10_000 },
      },
      { type: "mismatch", frame: "subscribed" },
      { type: "renewed" },
      { type: "silent", forMs: 35_000 },
    );
  }
  if ("deadline" in state) world.push({ type: state.deadline.fires });
  return pick(world);
}

function run(seed: number, length: number): void {
  const random = generator(seed);
  const ctx = (now: number): MachineContext => ({
    now,
    delay: (step, hintMs) => (hintMs ?? 0) + Math.floor(random() * 1000 * 2 ** Math.min(step, 5)),
    spread: () => Math.floor(random() * 1000),
    connectTimeoutMs: 15_000,
    authTimeoutMs: 15_000,
    stableMs: 10_000,
  });
  let state: MachineState = transition(
    { phase: "idle", failures: 0, authSeq: 0 },
    { type: "start" },
    ctx(0),
  ).state;
  let socket: Socket = "none";
  let ended = false;

  for (let i = 0, now = 0; i < length; i++, now += Math.floor(random() * 20_000)) {
    const event = nextEvent(random, state, socket);
    const before = state;
    const result = transition(state, event, ctx(now));
    const where = `seed ${seed}, step ${i}: ${before.phase} + ${event.type} → ${result.state.phase}`;
    state = result.state;

    if (before.phase === "closed" && before.by === "client") {
      expect(result, where).toEqual({ state: before, effects: [] });
    }
    if (
      (state.phase === "open" || state.phase === "reauthenticating") &&
      before.phase !== state.phase
    ) {
      expect(["authenticating", "open", "reauthenticating"], where).toContain(before.phase);
      if (before.phase === "authenticating") expect(event.type, where).toBe("admitted");
    }
    /* What the event says of the socket holds before the machine acts on it. */
    if (event.type === "closed" && !event.announced) socket = "none";
    if (event.type === "socket-open") socket = "open";
    for (const effect of result.effects) {
      if (effect.type === "open-socket") {
        expect(socket, `${where}: a second socket`).toBe("none");
        socket = "opening";
      }
      if (effect.type === "drop-socket") socket = "none";
      if (effect.type === "send-auth")
        expect(socket, `${where}: credentials on no open socket`).toBe("open");
      if (effect.type === "subscriptions-end") {
        expect(ended, `${where}: subscriptions ended twice`).toBe(false);
        ended = true;
      }
    }
    if (state.phase === "connecting" && before.phase !== "connecting") ended = false;
    const held = before.phase === "reconnecting" ? before.notBefore : undefined;
    if (event.type === "resume" && held !== undefined && now < held) {
      expect(state, `${where}: back before the server's wait`).toMatchObject({
        phase: "reconnecting",
        failures: before.failures,
      });
      expect(state.phase === "reconnecting" && state.retryAt >= held, where).toBe(true);
    }
    if ("deadline" in state) {
      expect(Number.isFinite(state.deadline.ms) && state.deadline.ms >= 0, where).toBe(true);
    }
    expect(state.failures, where).toBeGreaterThanOrEqual(0);
  }
}

describe("the connection's state machine under random sequences", () => {
  it.each(Array.from({ length: 500 }, (_, i) => 1_000 + i))(
    "holds its invariants with seed %i",
    (seed) => {
      run(seed, 300);
    },
  );
});
