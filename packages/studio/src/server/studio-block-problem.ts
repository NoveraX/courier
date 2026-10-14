import { describeValue } from "./describe-value";
import { isPlainObject } from "./is-plain-object";
import { routesSettingProblem } from "./routes-module/routes-setting-problem";
import { specHostEntryProblem } from "./spec-host-entry-problem";

/* The fields that name a TCP port, checked alike. */
const PORT_FIELDS = ["port", "mockBasePort"] as const;

/**
 * What is wrong with the `studio` block of a config, if anything.
 *
 * Studio binds `host` and `port`, assigns mock ports from `mockBasePort`,
 * fetches from the private hosts `allowedSpecHosts` lists and writes the
 * routes module where `routes` says, so a value none of that can use is a
 * config error that names the field, not a failure to listen or a setting
 * left at its default in silence.
 *
 * @param studio - The config's `studio` export, as evaluated
 * @returns Why the block is refused, or `null` when it is absent or usable
 * @example
 * ```ts
 * studioBlockProblem({ port: "6280" });
 * // → 'courier.config.studio.port is "6280", not a port: a whole number from 1 to 65535'
 * ```
 */
export function studioBlockProblem(studio: unknown): string | null {
  if (studio === undefined) return null;
  if (!isPlainObject(studio)) {
    return `courier.config.studio is ${describeValue(studio)}, not an object`;
  }
  return (
    addressProblem(studio) ??
    specHostsProblem(studio.allowedSpecHosts) ??
    routesSettingProblem(studio.routes)
  );
}

function addressProblem(studio: Record<string, unknown>): string | null {
  for (const field of PORT_FIELDS) {
    const value = studio[field];
    if (value === undefined || isPort(value)) continue;
    return `courier.config.studio.${field} is ${shown(value)}, not a port: a whole number from 1 to 65535`;
  }
  const { host, open } = studio;
  if (host !== undefined && (typeof host !== "string" || host.trim() === "")) {
    return `courier.config.studio.host is ${shown(host)}, not a host name or address`;
  }
  if (open !== undefined && typeof open !== "boolean") {
    return `courier.config.studio.open is ${shown(open)}, not true or false`;
  }
  return null;
}

function specHostsProblem(hosts: unknown): string | null {
  if (hosts === undefined) return null;
  if (!Array.isArray(hosts)) {
    return `courier.config.studio.allowedSpecHosts is ${describeValue(hosts)}, not a list of hosts`;
  }
  const entries: unknown[] = hosts;
  for (const [index, entry] of entries.entries()) {
    const problem = specHostEntryProblem(entry);
    if (problem !== null) return `courier.config.studio.allowedSpecHosts[${index}] ${problem}`;
  }
  return null;
}

function isPort(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535;
}

/* A value the developer typed is quoted back as typed; anything else is named. */
function shown(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return describeValue(value);
}
