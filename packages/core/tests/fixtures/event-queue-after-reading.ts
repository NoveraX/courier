/*
 * Run with --expose-gc. A burst fills a subscription's queue while its
 * reader is busy; the reader then takes every event and keeps none. The
 * output says how many of them the queue still holds after collections,
 * and how many it held before they were read, as the control.
 */
import { createEventQueue } from "../../src/realtime/sse/event-queue";

const collect = (globalThis as { gc?: () => void }).gc;
if (!collect) throw new Error("This script needs --expose-gc");

const BURST = 1000;

/* How many of the events are still reachable once everything that runs has run, and collected. */
async function reachable(refs: readonly WeakRef<object>[]): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  collect?.();
  collect?.();
  return refs.filter((ref) => ref.deref() !== undefined).length;
}

const queue = createEventQueue<{ blob: string }>(BURST);
const refs: WeakRef<object>[] = [];
for (let i = 0; i < BURST; i++) {
  const event = { data: { blob: `${i}:`.padEnd(10_000, "x") } };
  refs.push(new WeakRef(event));
  queue.push(event);
}
const held = await reachable(refs);

const reader = queue.iterator();
for (let i = 0; i < BURST; i++) await reader.next();
const left = await reachable(refs);

process.stdout.write(JSON.stringify({ held, size: queue.size, left }));
