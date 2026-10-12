/**
 * The zod schemas of the enterprise project, as source code: what every
 * source shares — statuses, owners, money, addresses, pages — and each
 * group's own record, what creating one takes, and what changing one does.
 */

/** Each part of a record: its schema, and a value a call may send for it. */
const FIELDS = {
  owner: ["Owner", '{ id: "u_1", email: "ada@example.com", name: "Ada" }'],
  tags: ["z.array(z.string().max(40)).max(20)", '["urgent"]'],
  metadata: ["z.record(z.string(), z.string())", "{}"],
  amount: ["Money", '{ currency: "USD", value: 120 }'],
  address: ["Address", '{ line1: "1 Main St", city: "Springfield", country: "US" }'],
  priority: ["z.number().int().min(0).max(5)", "2"],
  archived: ["z.boolean()", "false"],
  description: ["z.string().max(2000).optional()", undefined],
  parentId: ["z.string().nullable()", "null"],
  details: ["Details", '{ type: "physical", weight: 2 }'],
};

/**
 * A name as a type's: `access-keys` → `AccessKeys`.
 *
 * @param {string} name - The name
 * @returns {string} The name in PascalCase
 * @example
 * ```js
 * pascal("access-keys"); // "AccessKeys"
 * ```
 */
export function pascal(name) {
  return name.replace(/(^|[-_])(\w)/g, (_, __, letter) => letter.toUpperCase());
}

/**
 * The schemas every group of a source uses.
 *
 * @returns {string} The module's source
 * @example
 * ```js
 * writeFileSync("src/schemas/core/shared.ts", sharedSchemas());
 * ```
 */
export function sharedSchemas() {
  return `import { z } from "zod";

export const Status = z.enum(["draft", "active", "paused", "closed"]);
export type Status = z.infer<typeof Status>;
export const Owner = z.object({ id: z.string(), email: z.email(), name: z.string() });
export const Money = z.object({ currency: z.enum(["USD", "EUR", "GBP", "JPY"]), value: z.number() });
export const Address = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  postcode: z.string().optional(),
  country: z.string().length(2),
});
export const Details = z.discriminatedUnion("type", [
  z.object({ type: z.literal("physical"), weight: z.number().positive() }),
  z.object({ type: z.literal("digital"), url: z.url() }),
  z.object({ type: z.literal("service"), hours: z.number().int().min(1) }),
]);
export const ById = z.object({ id: z.string() });
export const ListQuery = z.object({
  page: z.number().int().min(1).optional(),
  size: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: Status.optional(),
});
export const Search = z.object({ q: z.string().min(1), limit: z.number().int().max(100).optional() });
export const Range = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() });
export const Removed = z.object({ id: z.string(), removed: z.literal(true) });
export const Exported = z.object({ url: z.url(), rows: z.number().int() });
export const Stats = z.object({ count: z.number().int(), byStatus: z.record(z.string(), z.number()) });
export const Change = z.object({ at: z.iso.datetime(), by: z.string(), field: z.string(), to: z.unknown() });

/** A page of a list: its items, where the next one starts, and how many there are. */
export function page<TItem extends z.ZodType>(item: TItem) {
  return z.object({ items: z.array(item), next: z.string().nullable(), total: z.number().int() });
}
`;
}

/**
 * A group's record, what creating one takes and what changing one sends.
 *
 * @param {string} type - The record's type name: `Accounts`
 * @param {readonly string[]} fields - The parts it has beyond its id, name, status and times
 * @returns {string} The module's source
 * @example
 * ```js
 * groupSchemas("Accounts", ["owner", "tags"]);
 * ```
 */
export function groupSchemas(type, fields) {
  const used = ["Status", ...new Set(fields.map((field) => FIELDS[field]?.[0]).filter(isShared))];
  const lines = fields.map((field) => `  ${field}: ${FIELDS[field]?.[0]},`).join("\n");
  return `import { z } from "zod";

import { ${used.sort().join(", ")} } from "./shared";

export const ${type}Item = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  status: Status,
${lines}
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ${type}Item = z.infer<typeof ${type}Item>;
export const ${type}Input = ${type}Item.omit({ id: true, createdAt: true, updatedAt: true });
export type ${type}Input = z.infer<typeof ${type}Input>;
export const ${type}Patch = ${type}Input.partial().extend({ id: z.string() });
`;
}

/**
 * A value of what creating a record takes, as a call would send it.
 *
 * @param {readonly string[]} fields - The record's parts beyond its id, name, status and times
 * @returns {string} The value's source
 * @example
 * ```js
 * inputValue(["tags"]); // '{ name: "Sample", status: "active", tags: ["urgent"] }'
 * ```
 */
export function inputValue(fields) {
  const parts = fields
    .map((field) => [field, FIELDS[field]?.[1]])
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => `${field}: ${value}`);
  return `{ ${['name: "Sample"', 'status: "active"', ...parts].join(", ")} }`;
}

function isShared(schema) {
  return typeof schema === "string" && /^[A-Z]/.test(schema);
}
