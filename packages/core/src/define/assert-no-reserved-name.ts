import { ConfigurationError } from "../errors/configuration-error";

/**
 * The key a group or a source keeps its own settings under, beside its
 * endpoints. An endpoint of that name would replace them.
 */
const SETTINGS_KEY = "options";

/**
 * Names every client answers to itself, at its root, on each group and on
 * each flat endpoint, whatever its source declares: a group or an endpoint
 * called by one of them could never be reached through a client.
 */
const CLIENT_ACCESSORS: ReadonlyMap<string, string> = new Map([
  ["raw", ".raw, which resolves a call to its whole response"],
  ["with", ".with(), which sets the options of the calls made through it"],
]);

/**
 * Refuse endpoints named for something other than themselves.
 *
 * An endpoint named `options` replaced a group's settings, so every other
 * endpoint of the group lost its prefix, or a source's, so every call lost
 * its baseURL — silently, with the types satisfied. One named `raw` or
 * `with` could not be called: a client reads those names as its own
 * accessors wherever the endpoint would sit.
 *
 * @param endpoints - The endpoints a group or a source is defined with
 * @param owner - What holds them, for the message: "group" or "source"
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` when one is named
 *   `options`, `raw` or `with`
 * @throws ConfigurationError `DOTTED_NAME` when a name holds a dot
 *
 * @example
 * ```ts
 * assertNoReservedName({ list: listEndpoint }, "group"); // passes
 * assertNoReservedName({ options: getOptions }, "group"); // throws
 * assertNoReservedName({ raw: download }, "source"); // throws
 * ```
 */
export function assertNoReservedName(endpoints: object, owner: "group" | "source"): void {
  refuseDottedName(endpoints, "an endpoint");
  if (Object.hasOwn(endpoints, SETTINGS_KEY)) {
    throw new ConfigurationError(
      "RESERVED_ENDPOINT_NAME",
      `[courier] an endpoint cannot be named "${SETTINGS_KEY}": the name holds the ${owner}'s settings. Give it another name, for example "getOptions".`,
    );
  }
  refuseClientAccessor(endpoints, "an endpoint", (name) => `get${capitalize(name)}`);
}

/**
 * Refuse groups named like a client's own accessors.
 *
 * A client answers `raw` and `with` at its root itself, so a group of either
 * name was out of reach through it.
 *
 * @param groups - The groups a source is defined with
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` when one is named `raw` or `with`
 * @throws ConfigurationError `DOTTED_NAME` when a name holds a dot
 *
 * @example
 * ```ts
 * assertNoReservedGroupName({ users }); // passes
 * assertNoReservedGroupName({ raw: files }); // throws
 * ```
 */
export function assertNoReservedGroupName(groups: object): void {
  refuseDottedName(groups, "a group");
  refuseClientAccessor(groups, "a group", (name) => `${name}Group`);
}

/* A dot separates the groups of a path, `billing.invoices.list`: a name
   holding one would be read as two. */
function refuseDottedName(record: object, what: string): void {
  const dotted = Object.keys(record).find((name) => name.includes("."));
  if (dotted === undefined) return;
  throw new ConfigurationError(
    "DOTTED_NAME",
    `[courier] ${what} cannot be named "${dotted}": a dot separates the groups of a path, so the name would be read as "${dotted.split(".").join('" then "')}". Give it a name without one, for example "${dotted.replaceAll(".", "_")}".`,
  );
}

function refuseClientAccessor(
  record: object,
  what: string,
  rename: (name: string) => string,
): void {
  for (const [name, accessor] of CLIENT_ACCESSORS) {
    if (!Object.hasOwn(record, name)) continue;
    throw new ConfigurationError(
      "RESERVED_ENDPOINT_NAME",
      `[courier] ${what} cannot be named "${name}": a client answers that name with ${accessor}, so it could never be reached. Give it another name, for example "${rename(name)}".`,
    );
  }
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
