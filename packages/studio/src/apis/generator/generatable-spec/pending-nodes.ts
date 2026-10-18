import { isNode, type SpecNode } from "../../parser/spec-node";
import type { SpecPath } from "./spec-path";

/** Checks a node of one kind, and leaves the nodes in it to be checked. */
export type NodeCheck = (node: SpecNode, at: SpecPath, pending: PendingNodes) => void;

interface Pending {
  check: NodeCheck;
  value: unknown;
  at: SpecPath;
}

/**
 * The nodes of a specification left to check, each with the check for its
 * kind, taken as they are met: the nodes a node leaves in the order its
 * lists and objects hold them, each before the next node's. They wait in a
 * list rather than on the stack, so a specification nested deeper than the
 * stack goes is checked all the same; a node met again as the same kind —
 * held twice, or holding itself, as a specification built in code may be —
 * is checked once.
 *
 * @example
 * ```ts
 * const pending = new PendingNodes();
 * pending.each(checkGroup, spec.groups, SpecPath.root(), "groups");
 * pending.checkAll();
 * ```
 */
export class PendingNodes {
  private readonly nodes: Pending[] = [];
  private readonly checked = new Map<NodeCheck, Set<SpecNode>>();

  /** Check a field's node later, unless it is absent: left out, or `null`. */
  later(check: NodeCheck, value: unknown, at: SpecPath, field: string): void {
    if (value === undefined || value === null) return;
    this.nodes.push({ check, value, at: at.field(field) });
  }

  /** Check each node of a field's list later; an absent list holds none. */
  each(check: NodeCheck, value: unknown, at: SpecPath, field: string): void {
    if (value === undefined || value === null) return;
    const list: SpecPath = at.field(field);
    if (!Array.isArray(value)) list.refuse(value, "it is not a list");
    const items: readonly unknown[] = value;
    items.forEach((item, index) => {
      this.nodes.push({ check, value: item, at: list.index(index) });
    });
  }

  /** Check each node of a field's object, keyed by names, later; an absent one holds none. */
  entries(check: NodeCheck, value: unknown, at: SpecPath, field: string): void {
    if (value === undefined || value === null) return;
    const map: SpecPath = at.field(field);
    if (!isNode(value)) map.refuse(value, "it is not an object");
    for (const [key, item] of Object.entries(value)) {
      this.nodes.push({ check, value: item, at: map.key(key) });
    }
  }

  /**
   * Check every node left, and the nodes each leaves, until none is.
   *
   * @throws {InvalidSpecError} For the first node refused as they are taken, or a value in it
   */
  checkAll(): void {
    this.inOrder(0);
    for (let next = this.nodes.pop(); next !== undefined; next = this.nodes.pop()) {
      const { check, value } = next;
      const at: SpecPath = next.at;
      if (!isNode(value)) at.refuse(value, "it is not an object");
      if (!this.firstTime(check, value)) continue;
      const from = this.nodes.length;
      check(value, at, this);
      this.inOrder(from);
    }
  }

  /* The nodes left since `from` are taken in the order they were left, as the specification holds them. */
  private inOrder(from: number): void {
    const left = this.nodes.splice(from).reverse();
    for (const node of left) this.nodes.push(node);
  }

  private firstTime(check: NodeCheck, node: SpecNode): boolean {
    let seen = this.checked.get(check);
    if (seen === undefined) {
      seen = new Set();
      this.checked.set(check, seen);
    }
    if (seen.has(node)) return false;
    seen.add(node);
    return true;
  }
}
