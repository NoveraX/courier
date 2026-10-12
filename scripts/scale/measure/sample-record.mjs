/**
 * A record of the enterprise project as its backend would answer with it:
 * every part its schema declares, each value one the schema accepts.
 */

/** A value for each part a record may have beyond its id, name, status and times. */
const VALUES = {
  owner: { id: "u_1", email: "ada@example.com", name: "Ada" },
  tags: ["urgent", "q3"],
  metadata: { region: "eu" },
  amount: { currency: "USD", value: 120 },
  address: { line1: "1 Main St", city: "Springfield", country: "US" },
  priority: 2,
  archived: false,
  description: "A record of the scale test",
  parentId: null,
  details: { type: "physical", weight: 2 },
};

/**
 * A record with the parts a group's records have.
 *
 * @param {readonly string[]} fields - The parts beyond its id, name, status and times
 * @param {string} [id] - Its id
 * @returns {Record<string, unknown>} The record
 * @example
 * ```js
 * sampleRecord(["owner", "tags"]);
 * ```
 */
export function sampleRecord(fields, id = "id_1") {
  const record = { id, name: "Sample", status: "active" };
  for (const field of fields) record[field] = VALUES[field];
  return { ...record, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" };
}
