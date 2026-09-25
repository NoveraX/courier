import { createLogger } from "@noverax/courier";
import { recordStartupIssue } from "../startup-issues";

const log = createLogger("Studio");

const WHOLE_NUMBER = /^\d+$/;

/* A timer set past 2^31 - 1 ms fires at once. A day is longer than any
   load should take, and leaves room for what is added to a budget. */
const MAX_BUDGET_MS = 86_400_000;

/**
 * A budget in milliseconds that an environment variable may set.
 *
 * The variable must hold a whole number of milliseconds from 1 up to a day.
 * Anything else is ignored with a warning that names the variable, and the
 * default applies; so does an unset or empty variable, silently. The warning
 * is also recorded for the banner, which would otherwise clear it from the
 * terminal and leave the value looking as though it applied.
 *
 * @param name - The environment variable
 * @param fallbackMs - The budget when the variable does not set one
 * @param env - Where the variable is read (default: the process environment)
 * @returns The budget, in milliseconds
 *
 * @example
 * ```ts
 * budgetFromEnv("COURIER_CONFIG_LOAD_TIMEOUT_MS", 20_000); // → 60000 when it holds "60000"
 * ```
 */
export function budgetFromEnv(
  name: string,
  fallbackMs: number,
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallbackMs;
  const value = WHOLE_NUMBER.test(raw) ? Number(raw) : Number.NaN;
  if (value >= 1 && value <= MAX_BUDGET_MS) return value;
  const warning =
    `Ignoring ${name}=${JSON.stringify(env[name])}: it must be a whole number of milliseconds ` +
    `from 1 to ${MAX_BUDGET_MS}. Using ${fallbackMs}.`;
  log.warn(warning);
  recordStartupIssue(warning);
  return fallbackMs;
}
