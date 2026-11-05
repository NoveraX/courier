/**
 * The signal a project's code reads to tell that Courier is reading its
 * definitions rather than serving requests: `COURIER_PHASE` holds
 * `definitions` in every process Courier starts to read them — the
 * `courier-cli routes` command, `courier-mcp --list`, Studio, the process a
 * bundler plugin reads the routes in — after the fashion of `NEXT_PHASE`.
 * Code that checks the environment as it is imported can skip the check
 * then, as `@t3-oss/env-core` does with `skipValidation`; Courier guesses
 * nothing for it. Where the application runs — `courier-server`,
 * `courier-mcp` serving an agent, `attachRuntime()`, the app itself — the
 * variable is not set.
 */

/** The variable a project's code reads the phase from. */
export const COURIER_PHASE = "COURIER_PHASE";

/** Its value while Courier reads the project's definitions. */
export const DEFINITIONS_PHASE = "definitions";

/**
 * Mark the process as one that reads the project's definitions, before the
 * project's code runs in it.
 *
 * @param env - The environment to mark (default: the process's)
 * @example
 * ```ts
 * enterDefinitionsPhase();
 * process.env.COURIER_PHASE; // "definitions"
 * ```
 */
export function enterDefinitionsPhase(env: NodeJS.ProcessEnv = process.env): void {
  env[COURIER_PHASE] = DEFINITIONS_PHASE;
}
