import type { Sources } from "@noverax/courier/define";

/**
 * Check the sources a server was asked to offer against the project's,
 * before anything is offered.
 *
 * @param sources - The project's sources
 * @param root - The project's root, for the message
 * @param only - The names `--source` gave, if any
 * @throws {Error} When the project has no sources, or none by a name given
 * @example
 * ```ts
 * checkSourceNames({ shop }, "/app", ["shop"]);
 * ```
 */
export function checkSourceNames(
  sources: Sources | undefined,
  root: string,
  only: readonly string[] | undefined,
): asserts sources is Sources {
  if (sources === undefined || Object.keys(sources).length === 0) {
    throw new Error(
      `No sources to offer: ${root} has no courier.config.* that declares them (see above)`,
    );
  }
  const unknown = only?.find((name) => !Object.hasOwn(sources, name));
  if (unknown !== undefined) {
    throw new Error(
      `--source ${unknown}: courier.config has no such source — it has ${Object.keys(sources).join(", ")}`,
    );
  }
}
