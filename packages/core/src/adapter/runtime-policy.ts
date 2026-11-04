/**
 * Where a handler's deployment settings come from — the names it is reached
 * by and the pages that may call it — and whether what they say holds.
 *
 * Both are often known only where the application runs: its own name comes
 * from the platform's environment. Yet the module that creates the handler
 * is also evaluated where the application is built — Next runs a route
 * module while it collects a page's data, SvelteKit while it analyses its
 * server — so a setting written as a value is computed from an environment
 * that is not the running application's, and one computed from a variable
 * the build lacks throws there. A setting may therefore be a function,
 * called when the first request that needs it comes in; and a handler whose
 * config names none reads `COURIER_ALLOWED_HOSTS` or
 * `COURIER_ALLOWED_ORIGINS`, entries separated by commas. The config wins
 * over the environment, and a function that returns `undefined` leaves the
 * setting to it.
 *
 * Each setting is read once. A list or a function is remembered by its
 * identity, which the handler's config holds: a handler's function runs
 * once, and two handlers given one function run it once between them. A
 * variable is remembered by its value, looked up on every request — less
 * than a microsecond — and parsed only when it is one not seen of late. A
 * setting that cannot be read fails closed: the function threw or returned
 * something other than a list, an entry can never match, the variable is
 * set and names nothing, or the setting is larger than it may be. The
 * reading then says why, and is remembered like any other; whoever enforces
 * the setting refuses what it decides and reports the reason, once for the
 * reading however many requests it refuses (`reportUnreadSetting`). A server
 * that reads its settings as it starts throws the reason instead.
 */

import { ConfigurationError } from "../errors";
import { createLogger } from "../logger";
import { originEntryProblem } from "./assert-allowed-origins";
import { type HostNames, hostNamesOf } from "./host-names";
import {
  NOT_SET,
  RUNTIME_SETTING_LIMITS,
  type RuntimeSetting,
  type SettingKind,
  type SettingReading,
} from "./runtime-setting";
import { settingReader } from "./setting-reader";

export {
  RUNTIME_SETTING_LIMITS,
  RUNTIME_SETTING_VARIABLES,
  type RuntimeSetting,
  type SettingReading,
} from "./runtime-setting";

const log = createLogger("Proxy");

/** The host names a handler is reached by; see `HandlerConfig.allowedHosts`. */
export type AllowedHostsSetting = RuntimeSetting<readonly string[]>;

/** The origins of other pages that may call a handler; see `HandlerConfig.allowedOrigins`. */
export type AllowedOriginsSetting = RuntimeSetting<readonly string[]>;

/* The readings whose reason has been logged: each is logged once. */
const reported = new WeakSet<ConfigurationError>();

const HOSTS: SettingKind<HostNames> = {
  name: "allowedHosts",
  entries: "hosts",
  compile: (entries) => {
    const hosts = hostNamesOf(entries);
    return "problem" in hosts ? { code: "INVALID_ALLOWED_HOST", ...hosts } : { value: hosts };
  },
};

const ORIGINS: SettingKind<readonly string[]> = {
  name: "allowedOrigins",
  entries: "origins",
  compile: (entries) => {
    for (const entry of entries) {
      const problem =
        entry.length > RUNTIME_SETTING_LIMITS.MAX_ORIGIN_LENGTH
          ? `is longer than an origin may be here (${RUNTIME_SETTING_LIMITS.MAX_ORIGIN_LENGTH} characters)`
          : originEntryProblem(entry);
      if (problem !== undefined) return { code: "INVALID_ALLOWED_ORIGIN", entry, problem };
    }
    return { value: [...entries] };
  },
};

const hostsReader = settingReader(HOSTS);
const originsReader = settingReader(ORIGINS);

/**
 * Read the host names a handler is reached by: the config's list, its
 * function's, or `COURIER_ALLOWED_HOSTS`.
 *
 * @param setting - The handler's `allowedHosts`
 * @returns The names, none when nothing sets them, or why the setting cannot be used
 * @example
 * ```ts
 * const hosts = readAllowedHosts(() => [new URL(process.env.APP_URL ?? "").host]);
 * if (!hosts.ok) return misconfigured(hosts.error);
 * ```
 */
export function readAllowedHosts(
  setting: AllowedHostsSetting | undefined,
): SettingReading<HostNames> {
  return hostsReader(setting);
}

/**
 * Read the origins of other pages that may call a handler: the config's
 * list, its function's, or `COURIER_ALLOWED_ORIGINS`.
 *
 * @param setting - The handler's `allowedOrigins`
 * @returns The origins, none when nothing sets them, or why the setting cannot be used
 * @example
 * ```ts
 * const origins = readAllowedOrigins(config.allowedOrigins);
 * if (origins.ok && !isOriginAllowed(request, origins.value)) return refuse(request);
 * ```
 */
export function readAllowedOrigins(
  setting: AllowedOriginsSetting | undefined,
): SettingReading<readonly string[]> {
  return originsReader(setting);
}

/**
 * Refuse, when a handler is created, a setting given as a list that cannot
 * be read: it is known then, and a mistake in it is better found before the
 * first request than by it. A function or a variable is read with that
 * request.
 *
 * @param settings - The handler's `allowedHosts` and `allowedOrigins`
 * @param where - The factory being configured, named in the error
 * @throws ConfigurationError naming the entry and what is wrong with it
 * @example
 * ```ts
 * assertListedSettings(config, "createHandler");
 * ```
 */
export function assertListedSettings(
  settings: {
    readonly allowedHosts?: AllowedHostsSetting | undefined;
    readonly allowedOrigins?: AllowedOriginsSetting | undefined;
  },
  where: string,
): void {
  for (const reading of [
    isListed(settings.allowedHosts) ? readAllowedHosts(settings.allowedHosts) : NOT_SET,
    isListed(settings.allowedOrigins) ? readAllowedOrigins(settings.allowedOrigins) : NOT_SET,
  ]) {
    if (!reading.ok) {
      throw new ConfigurationError(reading.error.code, `${where}: ${reading.error.message}`);
    }
  }
}

/**
 * Log why a setting cannot be read, the first time a request is refused for
 * it: one line at `error`, naming the setting, where it came from and what
 * is wrong, and what its function threw at `debug`, with its stack. A
 * reading is remembered, so its later refusals log nothing.
 *
 * @param error - Why the setting cannot be read, as its reading says
 * @example
 * ```ts
 * const hosts = readAllowedHosts(config.allowedHosts);
 * if (!hosts.ok) reportUnreadSetting(hosts.error);
 * ```
 */
export function reportUnreadSetting(error: ConfigurationError): void {
  if (reported.has(error)) return;
  reported.add(error);
  log.error(error.message);
  if (error.cause !== undefined) log.debug("What the setting's function threw", error.cause);
}

function isListed(
  setting: RuntimeSetting<readonly string[]> | undefined,
): setting is readonly string[] {
  return setting !== undefined && typeof setting !== "function";
}
