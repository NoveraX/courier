import type { DatabaseSync } from "node:sqlite";

import { isPlainObject } from "../is-plain-object";

/** What a mock's conditions were, as Studio last saw them set. */
export interface MockConditions {
  /** The network conditions the mocks file declared then, as JSON: they hold only while it declares the same. */
  declared: string;
  /** The mock's network conditions, as it reported them; `null` while it simulated none. */
  network: Record<string, unknown> | null;
  /** The scenario applied; `null` while none was. */
  scenario: string | null;
}

/** The conditions kept for each mock Studio runs. */
export interface MockConditionsStore {
  read(mockKey: string): MockConditions | undefined;
  write(mockKey: string, conditions: MockConditions): void;
  forget(mockKey: string): void;
}

const PREFIX = "mock.conditions.";

function conditionsOf(raw: unknown): MockConditions | undefined {
  if (!isPlainObject(raw) || typeof raw.declared !== "string") return undefined;
  const network = isPlainObject(raw.network) ? raw.network : null;
  const scenario = typeof raw.scenario === "string" ? raw.scenario : null;
  return { declared: raw.declared, network, scenario };
}

/**
 * The conditions set on each mock Studio runs — its network conditions and
 * the scenario applied — kept in the project's database, so a mock that
 * starts again, with Studio or after it, has them again.
 *
 * @param db - Studio's database
 * @returns The store
 * @example
 * ```ts
 * const conditions = createMockConditionsStore(db);
 * conditions.write("shop", { declared: "{}", network: null, scenario: "outage" });
 * ```
 */
export function createMockConditionsStore(db: DatabaseSync): MockConditionsStore {
  const select = db.prepare("SELECT value FROM studio_state WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO studio_state (key, value) VALUES (?, ?)");
  const remove = db.prepare("DELETE FROM studio_state WHERE key = ?");
  return {
    read(mockKey) {
      const value = select.get(`${PREFIX}${mockKey}`)?.value;
      return typeof value === "string" ? conditionsOf(JSON.parse(value)) : undefined;
    },
    write(mockKey, conditions) {
      upsert.run(`${PREFIX}${mockKey}`, JSON.stringify(conditions));
    },
    forget(mockKey) {
      remove.run(`${PREFIX}${mockKey}`);
    },
  };
}
