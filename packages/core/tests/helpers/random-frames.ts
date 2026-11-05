import type { WSMessage, WSMessageType } from "../../src/realtime/ws/ws-protocol";

/** Every frame type the protocol has. */
export const FRAME_TYPES: readonly WSMessageType[] = [
  "subscribe",
  "unsubscribe",
  "data",
  "message",
  "ping",
  "pong",
  "error",
  "subscribed",
  "unsubscribed",
  "complete",
  "auth",
  "auth_ok",
  "auth_error",
  "reauth_required",
  "disconnect",
  "renamed",
  "skip",
  "resync",
];

/* Strings a frame may carry that JSON has to escape, or that a reader might take for something else. */
const AWKWARD = ["", "  ", '"}', "\\", "</script>", "\u0000", "𝔘𝔫𝔦", "__proto__", "é".repeat(70)];

/** One of `items`, drawn by `random`. */
export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

/** A string: one JSON or a reader finds awkward, or a few random characters. */
export function randomText(random: () => number): string {
  if (random() < 0.5) return pick(random, AWKWARD);
  const length = Math.floor(random() * 12);
  return Array.from({ length }, () => String.fromCodePoint(Math.floor(random() * 0x2fff))).join("");
}

/** Any JSON value, nested at most `depth` deep. */
export function randomValue(random: () => number, depth: number): unknown {
  const roll = random();
  if (roll < 0.15) return null;
  if (roll < 0.3) return random() < 0.5;
  if (roll < 0.45) return Math.floor(random() * 2 ** 31) - 2 ** 30;
  if (roll < 0.65 || depth === 0) return randomText(random);
  const size = Math.floor(random() * 4);
  if (roll < 0.8) return Array.from({ length: size }, () => randomValue(random, depth - 1));
  return Object.fromEntries(
    Array.from({ length: size }, () => [randomText(random), randomValue(random, depth - 1)]),
  );
}

/** A frame of any type, its optional fields there or not, holding anything of their kind. */
export function randomFrame(random: () => number, topics: readonly string[] = []): WSMessage {
  const frame: WSMessage = { type: pick(random, FRAME_TYPES) };
  if (random() < 0.5) frame.id = randomText(random);
  if (random() < 0.6)
    frame.topic = topics.length > 0 && random() < 0.5 ? pick(random, topics) : randomText(random);
  if (random() < 0.5) frame.payload = randomValue(random, 3);
  if (random() < 0.3) frame.seq = Math.floor(random() * 1e9);
  if (random() < 0.2) {
    frame.error = { code: 4000 + Math.floor(random() * 999), message: randomText(random) };
  }
  return frame;
}
