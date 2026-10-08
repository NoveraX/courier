import { ConfigurationError } from "@noverax/courier";

const NOT_IN_A_NAME = /[^A-Za-z0-9_-]/g;
const LONGEST = 64;

/**
 * The name a tool goes by: the one `.agent()` gave it, or its call in the
 * client with `_` for each dot — `orders_cancel` — led by its source's name
 * when the server offers several sources.
 *
 * @param path - Its call in the client under its source: `orders.cancel`
 * @param source - The source it belongs to, named when the server offers several
 * @param given - The name `.agent()` gave it, if any
 * @returns The tool's name
 * @throws ConfigurationError `AGENT_OPTIONS_INVALID` when the name is longer than a client takes
 * @example
 * ```ts
 * toolNameOf("orders.cancel", "shop"); // "shop_orders_cancel"
 * ```
 */
export function toolNameOf(path: string, source: string | undefined, given?: string): string {
  if (given !== undefined) return given;
  const name = (source === undefined ? path : `${source}.${path}`)
    .replaceAll(".", "_")
    .replace(NOT_IN_A_NAME, "_");
  if (name.length > LONGEST) {
    throw new ConfigurationError(
      "AGENT_OPTIONS_INVALID",
      `[courier] ${source ?? ""}${source === undefined ? "" : "."}${path} would be the tool "${name}", ` +
        `${name.length} characters, more than the ${LONGEST} a client takes: name it with .agent({ name }).`,
    );
  }
  return name;
}
