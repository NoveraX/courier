import type { DatabaseSync } from "node:sqlite";

import type { EndpointSeen, FieldSeen } from "./answer-observations";

/**
 * Read every endpoint's observations from Studio's database, each with its
 * fields; a row that is not what Studio writes is passed over.
 *
 * @param db - Studio's database
 * @returns The observations, by endpoint
 * @example
 * ```ts
 * readObservations(db).map((seen) => seen.endpoint);
 * ```
 */
export function readObservations(db: DatabaseSync): EndpointSeen[] {
  const endpoints = new Map<string, EndpointSeen>();
  for (const row of db.prepare("SELECT * FROM answered_calls").all()) {
    const { source, endpoint, calls, first_seen, last_seen, cut } = row;
    if (typeof source !== "string" || typeof endpoint !== "string") continue;
    endpoints.set(JSON.stringify([source, endpoint]), {
      source,
      endpoint,
      calls: Number(calls),
      firstSeen: Number(first_seen),
      lastSeen: Number(last_seen),
      cut: Number(cut),
      fields: [],
    });
  }
  for (const row of db.prepare("SELECT * FROM answer_fields").all()) {
    const seen = endpoints.get(JSON.stringify([row.source, row.endpoint]));
    if (!seen || typeof row.path !== "string" || typeof row.type !== "string") continue;
    seen.fields.push({
      path: row.path,
      type: row.type,
      firstSeen: Number(row.first_seen),
      lastSeen: Number(row.last_seen),
      count: Number(row.count),
      places: placesOf(row.places),
    });
  }
  return [...endpoints.values()];
}

/**
 * Write the observations of the endpoints given, in place of what was kept
 * of them, and remove those of the endpoints forgotten — in one transaction.
 *
 * @param db - Studio's database
 * @param written - The endpoints whose observations changed
 * @param forgotten - The endpoints forgotten, as `[source, endpoint]`
 * @example
 * ```ts
 * writeObservations(db, [seen], []);
 * ```
 */
export function writeObservations(
  db: DatabaseSync,
  written: readonly EndpointSeen[],
  forgotten: ReadonlyArray<readonly [string, string]>,
): void {
  const removeFields = db.prepare("DELETE FROM answer_fields WHERE source = ? AND endpoint = ?");
  const removeCalls = db.prepare("DELETE FROM answered_calls WHERE source = ? AND endpoint = ?");
  const putCalls = db.prepare(
    "INSERT OR REPLACE INTO answered_calls (source, endpoint, calls, first_seen, last_seen, cut) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const putField = db.prepare(
    "INSERT INTO answer_fields (source, endpoint, path, type, first_seen, last_seen, count, places) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    for (const [source, endpoint] of forgotten) {
      removeFields.run(source, endpoint);
      removeCalls.run(source, endpoint);
    }
    for (const seen of written) {
      removeFields.run(seen.source, seen.endpoint);
      putCalls.run(seen.source, seen.endpoint, seen.calls, seen.firstSeen, seen.lastSeen, seen.cut);
      for (const field of seen.fields) putField.run(...fieldRow(seen, field));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function fieldRow(
  seen: EndpointSeen,
  field: FieldSeen,
): [string, string, string, string, number, number, number, string] {
  return [
    seen.source,
    seen.endpoint,
    field.path,
    field.type,
    field.firstSeen,
    field.lastSeen,
    field.count,
    JSON.stringify(field.places),
  ];
}

function placesOf(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((place): place is string => typeof place === "string")
      : [];
  } catch {
    /* A list that is not JSON names no place. */
    return [];
  }
}
