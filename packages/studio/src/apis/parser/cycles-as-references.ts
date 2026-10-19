import { pointerSegment } from "./pointer-segment";
import type { SpecNode } from "./spec-node";

/** An object being walked: where the document writes it, and the entries left to walk. */
interface Frame {
  readonly node: object;
  readonly pointer: string;
  readonly entries: ReadonlyArray<[string, unknown]>;
  next: number;
}

/**
 * Write each place a document holds an object inside itself as a
 * reference to that object. YAML's aliases let a node sit inside itself —
 * `Tree: &tree { properties: { child: *tree } }` — as no JSON document can,
 * and reading such a schema followed it down until the stack ran out. The
 * reference reads as the document means it: a tree whose child is a tree.
 * An object several places share, none of them inside it, stays shared.
 *
 * @param document - The document as read from its YAML, changed in place
 * @returns The same document, with no object inside itself
 * @example
 * ```ts
 * cyclesAsReferences(readYaml(text)).components.schemas.Tree.properties.child;
 * // → { $ref: "#/components/schemas/Tree" }
 * ```
 */
export function cyclesAsReferences(document: SpecNode): SpecNode {
  const open = new Map<object, string>([[document, "#"]]);
  const walked = new Set<object>();
  const frames: Frame[] = [{ node: document, pointer: "#", entries: entriesOf(document), next: 0 }];
  for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
    const entry = frame.entries[frame.next];
    frame.next += 1;
    if (entry === undefined) {
      frames.pop();
      open.delete(frame.node);
      walked.add(frame.node);
      continue;
    }
    const [key, child] = entry;
    if (typeof child !== "object" || child === null || walked.has(child)) continue;
    const around = open.get(child);
    if (around !== undefined) {
      Reflect.set(frame.node, key, { $ref: around });
      continue;
    }
    const pointer = `${frame.pointer}/${pointerSegment(key)}`;
    open.set(child, pointer);
    frames.push({ node: child, pointer, entries: entriesOf(child), next: 0 });
  }
  return document;
}

function entriesOf(node: object): Array<[string, unknown]> {
  return Object.entries(node);
}
