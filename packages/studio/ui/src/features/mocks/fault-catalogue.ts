/** The faults a mock injects, grouped as the menus that add them list them. */
export type FaultGroup = "server" | "client" | "connection";

/** How Studio names and draws a fault: its label, what it does, its group, and its fill in a mix. */
export interface FaultLook {
  type: string;
  label: string;
  sub: string;
  group: FaultGroup;
  fill: string;
}

const SERVER = "bg-err";
const CLIENT = "bg-warn";

/** Each fault Studio offers, in the order its menus list them. */
export const FAULT_CATALOGUE: readonly FaultLook[] = [
  { type: "500", label: "HTTP 500", sub: "Internal server error", group: "server", fill: SERVER },
  {
    type: "502",
    label: "HTTP 502",
    sub: "Bad gateway",
    group: "server",
    fill: "bg-[color-mix(in_srgb,var(--color-err)_70%,var(--color-fg-subtle))]",
  },
  {
    type: "503",
    label: "HTTP 503",
    sub: "Service unavailable · Retry-After",
    group: "server",
    fill: "bg-[color-mix(in_srgb,var(--color-err)_55%,var(--color-warn))]",
  },
  {
    type: "504",
    label: "HTTP 504",
    sub: "Gateway timeout",
    group: "server",
    fill: "bg-[color-mix(in_srgb,var(--color-err)_60%,var(--color-bg))]",
  },
  {
    type: "507",
    label: "HTTP 507",
    sub: "Insufficient storage",
    group: "server",
    fill: "bg-[color-mix(in_srgb,var(--color-err)_45%,var(--color-fg-subtle))]",
  },
  { type: "400", label: "HTTP 400", sub: "Bad request", group: "client", fill: CLIENT },
  {
    type: "401",
    label: "HTTP 401",
    sub: "Unauthorized · bearer challenge",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_70%,var(--color-err))]",
  },
  {
    type: "403",
    label: "HTTP 403",
    sub: "Forbidden",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_55%,var(--color-err))]",
  },
  {
    type: "404",
    label: "HTTP 404",
    sub: "Not found",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_70%,var(--color-fg-subtle))]",
  },
  {
    type: "409",
    label: "HTTP 409",
    sub: "Conflict",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_55%,var(--color-fg-subtle))]",
  },
  {
    type: "413",
    label: "HTTP 413",
    sub: "Content too large",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_80%,var(--color-bg))]",
  },
  {
    type: "415",
    label: "HTTP 415",
    sub: "Unsupported media type",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_60%,var(--color-bg))]",
  },
  {
    type: "422",
    label: "HTTP 422",
    sub: "Unprocessable content",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_45%,var(--color-fg-subtle))]",
  },
  {
    type: "429",
    label: "HTTP 429",
    sub: "Too many requests · Retry-After",
    group: "client",
    fill: "bg-[color-mix(in_srgb,var(--color-warn)_60%,var(--color-err))]",
  },
  {
    type: "timeout",
    label: "timeout",
    sub: "Held until it times out · 408",
    group: "connection",
    fill: "bg-warn",
  },
  {
    type: "reset",
    label: "reset",
    sub: "Connection reset",
    group: "connection",
    fill: "bg-fg-subtle",
  },
  {
    type: "interrupt",
    label: "interrupt",
    sub: "Connection lost mid-upload",
    group: "connection",
    fill: "bg-fg-muted",
  },
];

/** The menus' headings for each group. */
export const FAULT_GROUP_LABEL: Readonly<Record<FaultGroup, string>> = {
  server: "Server errors",
  client: "Client errors",
  connection: "Connection",
};

const LOOKS: ReadonlyMap<string, FaultLook> = new Map(
  FAULT_CATALOGUE.map((look) => [look.type, look]),
);

/**
 * How Studio names and draws a fault: from the catalogue, or — for a status
 * a mock was given in code that the catalogue does not list — as its
 * number, filled as its class of error.
 *
 * @param type - The fault: a status, `timeout`, `reset` or `interrupt`
 * @returns Its look
 * @example
 * ```ts
 * faultLook("413").sub; // "Content too large"
 * faultLook("418").label; // "HTTP 418"
 * ```
 */
export function faultLook(type: string): FaultLook {
  const known = LOOKS.get(type);
  if (known) return known;
  const server = type.startsWith("5");
  return {
    type,
    label: `HTTP ${type}`,
    sub: server ? "Server error" : "Client error",
    group: server ? "server" : "client",
    fill: server ? SERVER : CLIENT,
  };
}
