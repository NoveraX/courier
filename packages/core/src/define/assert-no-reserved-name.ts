import { ConfigurationError } from "../errors/configuration-error";

/**
 * The key a group or a source keeps its own settings under, beside its
 * endpoints. An endpoint of that name would replace them.
 */
const RESERVED_ENDPOINT_NAME = "options";

/**
 * Refuse endpoints that would overwrite the settings stored beside them.
 *
 * An endpoint named `options` replaced a group's settings, so every other
 * endpoint of the group lost its prefix, or a source's, so every call lost
 * its baseURL — silently, with the types satisfied.
 *
 * @param endpoints - The endpoints a group or a source is defined with
 * @param owner - What holds them, for the message: "group" or "source"
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` when one is named `options`
 *
 * @example
 * ```ts
 * assertNoReservedName({ list: listEndpoint }, "group"); // passes
 * assertNoReservedName({ options: getOptions }, "group"); // throws
 * ```
 */
export function assertNoReservedName(endpoints: object, owner: "group" | "source"): void {
  if (!Object.hasOwn(endpoints, RESERVED_ENDPOINT_NAME)) return;
  throw new ConfigurationError(
    "RESERVED_ENDPOINT_NAME",
    `[courier] an endpoint cannot be named "${RESERVED_ENDPOINT_NAME}": the name holds the ${owner}'s settings. Give it another name, for example "getOptions".`,
  );
}
