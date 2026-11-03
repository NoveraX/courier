import { ConfigurationError, type ConfigurationErrorCode } from "../errors/configuration-error";
import { ENDPOINT_SCHEMA } from "../validation";

/**
 * The key a group or a source keeps its own settings under, beside its
 * endpoints. An endpoint of that name would replace them.
 */
const SETTINGS_KEY = "options";

/**
 * The name every object gives its prototype. Copied onto a group or a
 * source, an endpoint of that name replaced its prototype instead of
 * becoming its own: it was lost, and the group took on the endpoint's
 * members.
 */
const PROTOTYPE_KEY = "__proto__";

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
 * One named `__proto__` was lost, whether its record holds the name as its
 * own or a literal written without brackets made it the record's prototype.
 *
 * @param endpoints - The endpoints a group or a source is defined with
 * @param owner - What holds them, for the message: "group" or "source"
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` when one is named
 *   `options`, `raw`, `with` or `__proto__`
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
    refuse("an endpoint", SETTINGS_KEY, `the name holds the ${owner}'s settings`, "getOptions");
  }
  refuseClientAccessor(endpoints, "an endpoint", (name) => `get${capitalize(name)}`);
  /* A record holding the name as its own, or one whose prototype a literal set to the endpoint. */
  const prototype: unknown = Object.getPrototypeOf(endpoints);
  if (
    Object.hasOwn(endpoints, PROTOTYPE_KEY) ||
    (typeof prototype === "object" && prototype !== null && ENDPOINT_SCHEMA in prototype)
  ) {
    refuse(
      "an endpoint",
      PROTOTYPE_KEY,
      `it is the name every object gives its prototype, so the endpoint would be lost from its ${owner}`,
      "getProto",
    );
  }
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
  refuse(
    what,
    dotted,
    `a dot separates the groups of a path, so the name would be read as "${dotted.split(".").join('" then "')}"`,
    dotted.replaceAll(".", "_"),
    "a name without one",
    "DOTTED_NAME",
  );
}

function refuseClientAccessor(
  record: object,
  what: string,
  rename: (name: string) => string,
): void {
  for (const [name, accessor] of CLIENT_ACCESSORS) {
    if (!Object.hasOwn(record, name)) continue;
    refuse(
      what,
      name,
      `a client answers that name with ${accessor}, so it could never be reached`,
      rename(name),
    );
  }
}

/* Every refusal reads alike: the name, why it cannot be one, and a name it could be instead. */
function refuse(
  what: string,
  name: string,
  why: string,
  example: string,
  instead = "another name",
  code: ConfigurationErrorCode = "RESERVED_ENDPOINT_NAME",
): never {
  throw new ConfigurationError(
    code,
    `[courier] ${what} cannot be named "${name}": ${why}. Give it ${instead}, for example "${example}".`,
  );
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
