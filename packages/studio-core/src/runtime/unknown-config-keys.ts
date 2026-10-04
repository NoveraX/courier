import type {
  CourierConfig,
  CourierRuntimeConfig,
  CourierServerConfig,
  CourierStudioConfig,
} from "@noverax/courier/config";

/* The keys Courier reads, by block; `satisfies` holds each list to its type. */
const TOP_LEVEL = {
  sources: true,
  imports: true,
  studio: true,
  server: true,
  runtime: true,
} satisfies Record<keyof CourierConfig, true>;

const STUDIO = {
  port: true,
  host: true,
  mockBasePort: true,
  open: true,
  allowedSpecHosts: true,
} satisfies Record<keyof CourierStudioConfig, true>;

const SERVER = {
  port: true,
  host: true,
  allowedOrigins: true,
  allowedHosts: true,
  maxBodyBytes: true,
  maxUploadBytes: true,
} satisfies Record<keyof CourierServerConfig, true>;

const RUNTIME = { appOrigin: true } satisfies Record<keyof CourierRuntimeConfig, true>;

const BLOCKS = new Map<string, Readonly<Record<string, true>>>([
  ["studio", STUDIO],
  ["server", SERVER],
  ["runtime", RUNTIME],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The keys of a courier.config that Courier does not read, at the top and
 * in its `studio`, `server` and `runtime` blocks — a misspelt `studo:` say
 * — so a load can name them rather than ignore them in silence.
 *
 * @param config - The config, as its module exported it
 * @returns Each such key, dotted under its block
 * @example
 * ```ts
 * unknownConfigKeys({ sources: {}, studo: {}, server: { prot: 3001 } }); // → ["studo", "server.prot"]
 * ```
 */
export function unknownConfigKeys(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (!Object.hasOwn(TOP_LEVEL, key)) {
      unknown.push(key);
      continue;
    }
    const known = BLOCKS.get(key);
    if (!known || !isRecord(value)) continue;
    for (const inner of Object.keys(value)) {
      if (!Object.hasOwn(known, inner)) unknown.push(`${key}.${inner}`);
    }
  }
  return unknown;
}
