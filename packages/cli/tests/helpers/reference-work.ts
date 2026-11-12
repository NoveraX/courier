/**
 * A fixed piece of work, by which a test of time reads a second of the
 * machine it runs on as one of the machine its budget was set on.
 *
 * It is plain JavaScript that shares no code with what such a test times,
 * so that a slower parse or walk shows in the time and not in the
 * reference too. From a seeded generator, the same on every run, it
 * builds a tree of 120 000 objects, walks it three times counting the
 * names on its nodes, writes the counts out as text, reads them back and
 * sorts them: work of a codemod's kinds — allocating, following
 * references, hashing and slicing strings — that comes to
 * {@link REFERENCE_SUM}, which says it did all of it, the work that was
 * measured. Walked once, the tree slowed less than the migration of
 * `migrate-budget.test.ts` does on a slower core: on the Mac's efficiency
 * cores, 2.2 to 2.4 times where the migration slowed 3.2 to 5.4 times.
 * Walked three times, it slows as the migration does or up to a fifth
 * more, so that those cores read the migration as the performance cores
 * do, or up to a fifth faster.
 */

/* A node of the tree: one of four kinds, a name of a small set, a value, the nodes below it. */
interface Node {
  readonly kind: number;
  readonly name: string;
  readonly value: number;
  readonly children: Node[];
}

const NODES = 120_000;
const WALKS = 3;
const NAMES = Array.from({ length: 96 }, (_, at) => `name${(at * 7919).toString(36)}`);

/** What a run of {@link referenceWork} comes to. */
export const REFERENCE_SUM = 1_703_015_419;

/**
 * What a run of {@link referenceWork} costs on the machine the budgets
 * of this package's tests were set on, in its thread's milliseconds, as
 * {@link referenceMs} times it in `migrate-budget.test.ts`, right before
 * the migration — the best of the five runs the test's process starts
 * with: an Apple M2 Max, on Node 24, the version `.nvmrc` names, the
 * median of sixteen such processes, run while the machine's load stayed
 * between 3 and 6. On Node 22 the same median is 53 ms, on Node 26 48 ms.
 */
export const REFERENCE_MS = 42;

/**
 * One run of the work.
 *
 * @returns What it comes to: {@link REFERENCE_SUM}
 * @example
 * ```ts
 * referenceWork() === REFERENCE_SUM; // true
 * ```
 */
export function referenceWork(): number {
  let state = 0x9e3779b9;
  const next = (below: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % below;
  };
  const root: Node = { kind: 0, name: "root", value: 0, children: [] };
  const nodes: Node[] = [root];
  for (let at = 1; at < NODES; at += 1) {
    const name = NAMES[next(NAMES.length)] ?? "";
    const node: Node = { kind: next(4), name, value: next(1000), children: [] };
    nodes[next(at)]?.children.push(node);
    nodes.push(node);
  }
  const counts = new Map<string, number>();
  let sum = 0;
  for (let walk = 0; walk < WALKS; walk += 1) {
    const stack: Node[] = [root];
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
      if (node.kind === 1) sum = (sum + node.value) | 0;
      else if (node.kind === 2) sum ^= node.value << 3;
      else if (node.kind === 3) sum = Math.imul(sum, 31) + node.children.length;
      for (const child of node.children) stack.push(child);
    }
  }
  const text = [...counts].map(([name, count]) => `${name}=${count}`).join(";");
  const read = text.split(";").map((pair) => {
    const at = pair.indexOf("=");
    return { name: pair.slice(0, at), count: Number(pair.slice(at + 1)) };
  });
  read.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return (sum ^ Math.imul(read.length, read[0]?.count ?? 0)) >>> 0;
}

/**
 * What a run of {@link referenceWork} costs here, in this thread's
 * milliseconds: the best of a few runs, each timed by this thread's CPU
 * time — the first ones compile the work, and a later one may pay for
 * the trees an earlier one left to the collector. On Windows, whose
 * clock counts a thread's time in ticks of about 16 ms, it is to within
 * a tick.
 *
 * @param runs - How many runs to take the best of
 * @returns The best run's time
 * @example
 * ```ts
 * const scale = REFERENCE_MS / referenceMs(); // 0.5 on a machine half as fast
 * ```
 */
export function referenceMs(runs = 5): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    const started = process.threadCpuUsage();
    const sum = referenceWork();
    const spent = process.threadCpuUsage(started);
    if (sum !== REFERENCE_SUM)
      throw new Error(
        `The reference work came to ${sum}, not ${REFERENCE_SUM}: it is not the work that was measured`,
      );
    best = Math.min(best, (spent.user + spent.system) / 1000);
  }
  return best;
}
