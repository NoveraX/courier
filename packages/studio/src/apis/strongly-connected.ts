/* Where the walk stands at one node: the node, its targets, and the next of them to follow. */
interface Frame {
  node: string;
  targets: readonly string[];
  at: number;
}

/**
 * The sets of nodes that reach each other, by Tarjan's algorithm, walked
 * with a list of its own rather than the call stack, so a chain as long as
 * a specification can make is walked as surely as a short one. Each set is
 * closed only once everything it reaches is, so a set comes after every set
 * it reaches. A node alone is a set of its own; whether it reaches itself
 * is the caller's to ask.
 *
 * @param nodes - Every node, each walked once
 * @param targetsOf - The nodes a node leads to; one that is not among `nodes` is passed over
 * @returns The sets, each in the order its nodes were reached
 * @example
 * ```ts
 * stronglyConnected(["a", "b", "c"], (node) => ({ a: ["b"], b: ["a"], c: [] })[node] ?? []);
 * // → [["a", "b"], ["c"]]
 * ```
 */
export function stronglyConnected(
  nodes: Iterable<string>,
  targetsOf: (node: string) => readonly string[],
): string[][] {
  const known = new Set(nodes);
  const walk = { order: new Map<string, number>(), low: new Map<string, number>() };
  const stack: string[] = [];
  const onStack = new Set<string>();
  const sets: string[][] = [];
  const open = (frames: Frame[], node: string): void => {
    walk.order.set(node, walk.order.size);
    walk.low.set(node, walk.order.size - 1);
    stack.push(node);
    onStack.add(node);
    frames.push({ node, targets: targetsOf(node).filter((target) => known.has(target)), at: 0 });
  };
  for (const root of known) {
    if (walk.order.has(root)) continue;
    const frames: Frame[] = [];
    open(frames, root);
    for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
      const target = frame.targets[frame.at];
      frame.at += 1;
      if (target === undefined) close(frames, frame, { walk, stack, onStack, sets });
      else if (!walk.order.has(target)) open(frames, target);
      else if (onStack.has(target)) lower(walk.low, frame.node, walk.order.get(target));
    }
  }
  return sets;
}

/* A node done with: its lowest reach passed to the node it was reached from, and its set closed when it roots one. */
function close(
  frames: Frame[],
  frame: Frame,
  state: {
    walk: { order: Map<string, number>; low: Map<string, number> };
    stack: string[];
    onStack: Set<string>;
    sets: string[][];
  },
): void {
  frames.pop();
  const { walk, stack, onStack, sets } = state;
  const parent = frames.at(-1);
  if (parent !== undefined) lower(walk.low, parent.node, walk.low.get(frame.node));
  if (walk.low.get(frame.node) !== walk.order.get(frame.node)) return;
  const set: string[] = [];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    onStack.delete(node);
    set.push(node);
    if (node === frame.node) break;
  }
  sets.push(set.reverse());
}

function lower(low: Map<string, number>, node: string, value: number | undefined): void {
  const current = low.get(node);
  if (value !== undefined && current !== undefined && value < current) low.set(node, value);
}
