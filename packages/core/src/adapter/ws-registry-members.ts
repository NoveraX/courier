import type { Selection } from "./connection-selector";
import { createMetaIndex } from "./ws-meta-index";
import type { CommandTarget, JoiningEntry, RegistryEntry } from "./ws-registry-types";

/** The connections one replica holds, as a selection finds them. */
export interface RegistryMembers {
  /** The connections let in, by id: what reads, messages and broadcasts reach */
  readonly entries: ReadonlyMap<string, RegistryEntry>;
  /** Hold a connection `onConnect` admitted: only a command reaches it until it is added */
  join(entry: JoiningEntry): void;
  /** Let a connection in, which ends its joining */
  add(entry: RegistryEntry): void;
  /** Let a connection go, joining or added */
  remove(connectionId: string): void;
  /** Index a connection let in by its metadata as `onReauth` renewed it */
  updateMeta(connectionId: string, meta: Record<string, unknown>): void;
  /** The connections let in that a selection names, each once */
  select(selection: Selection): RegistryEntry[];
  /** What a command for a selection reaches, each once: the connections let in, and those joining */
  reach(selection: Selection): CommandTarget[];
}

/**
 * The members of one replica's registry: the connections let in, and those
 * `onConnect` admitted that still wait for their place — which a sign-out
 * or an eviction must reach all the same — in one index, so a selector
 * names both alike. What it compares is a frozen copy of each one's
 * metadata, as `onConnect` gave it or as `onReauth` last renewed it: a
 * change to `ctx.meta` after that is not seen.
 *
 * @returns The members, none yet
 * @example
 * ```ts
 * const members = createRegistryMembers();
 * members.join({ connectionId, meta: { userId: "u1" }, close, requireAuth, evict });
 * members.reach({ fields: [["userId", "u1"]] }); // the joining connection
 * members.select({ fields: [["userId", "u1"]] }); // none: it is not let in yet
 * ```
 */
export function createRegistryMembers(): RegistryMembers {
  const entries = new Map<string, RegistryEntry>();
  const joining = new Map<string, JoiningEntry>();
  const index = createMetaIndex();

  function remove(connectionId: string): void {
    const held = entries.get(connectionId) ?? joining.get(connectionId);
    if (held) index.remove(connectionId, held.meta);
    entries.delete(connectionId);
    joining.delete(connectionId);
  }

  function idsOf(selection: Selection): string[] {
    return "ids" in selection ? [...new Set(selection.ids)] : index.select(selection.fields);
  }

  return {
    entries,
    join(entry) {
      remove(entry.connectionId);
      const held = { ...entry, meta: Object.freeze({ ...entry.meta }) };
      joining.set(entry.connectionId, held);
      index.add(entry.connectionId, held.meta);
    },
    add(entry) {
      remove(entry.connectionId);
      entry.meta = Object.freeze({ ...entry.meta });
      entries.set(entry.connectionId, entry);
      index.add(entry.connectionId, entry.meta);
    },
    remove,
    updateMeta(connectionId, meta) {
      const entry = entries.get(connectionId);
      if (!entry) return;
      index.remove(connectionId, entry.meta);
      entry.meta = Object.freeze({ ...meta });
      index.add(connectionId, entry.meta);
    },
    select(selection) {
      const named = idsOf(selection).map((id) => entries.get(id));
      return named.filter((entry): entry is RegistryEntry => entry !== undefined);
    },
    reach(selection) {
      const named = idsOf(selection).map(
        (id): CommandTarget | undefined => entries.get(id) ?? joining.get(id),
      );
      return named.filter((entry): entry is CommandTarget => entry !== undefined);
    },
  };
}
