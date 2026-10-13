import { ConfigurationError } from "../errors/configuration-error";
import { resolveEndpoint } from "../utils/execute-resolve";

/**
 * Refuse, where an API is defined, a `cancelPrevious` that names anything
 * but the API's own reads: a path it does not define would cancel nothing,
 * and a write cancelled by a newer call has usually been applied by the
 * server while its caller is told it was not.
 *
 * @param api - The API, as `defineApi` built it
 * @param paths - The API's `cancelPrevious`
 * @param where - The API, named in the error
 * @throws ConfigurationError `CANCEL_PREVIOUS_INVALID`
 * @example
 * ```ts
 * assertCancelPrevious(api, ["users.search"], "accounts");
 * ```
 */
export function assertCancelPrevious(api: object, paths: unknown, where: string): void {
  if (paths === undefined) return;
  if (!Array.isArray(paths))
    refuse(where, 'is a list of the reads it cancels, such as ["users.search"]');
  for (const path of paths as unknown[]) {
    if (typeof path !== "string")
      refuse(where, `names ${JSON.stringify(path)}, which is no endpoint's path`);
    const dot = path.lastIndexOf(".");
    const group = dot < 0 ? undefined : path.slice(0, dot);
    const resolved = resolveEndpoint(api as Record<string, unknown>, group, path.slice(dot + 1));
    if (resolved.schema === undefined && resolved.endpoint === undefined) {
      refuse(where, `names "${path}", which the API does not define`);
    }
    if (resolved.schema?.type !== "query" || resolved.schema.transport !== undefined) {
      refuse(
        where,
        `names "${path}", which is not a read: a cancelled write has usually been applied`,
      );
    }
  }
}

function refuse(where: string, problem: string): never {
  throw new ConfigurationError("CANCEL_PREVIOUS_INVALID", `${where}: cancelPrevious ${problem}`);
}
