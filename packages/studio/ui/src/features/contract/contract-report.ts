import { isPlainObject } from "@/socket/is-plain-object";

/** How an endpoint's real answers stand against its response schema. */
export type ContractState = "confirmed" | "drifted" | "unobserved";

/** A way an endpoint's answers differ from what its schema declares. */
export interface Drift {
  path: string;
  kind: "undeclared" | "type" | "missing";
  observed: string[];
  declared: string[] | undefined;
  firstSeen: number;
  lastSeen: number;
  count: number;
  places: string[];
}

/** One endpoint's contract, as Studio reports it. */
export interface EndpointContract {
  source: string;
  /** Its call in the client: `products.get` */
  endpoint: string;
  state: ContractState;
  calls: number;
  lastSeen: number | undefined;
  cut: number;
  drift: Drift[];
  fix: Array<{ within: string; line: string }>;
}

const STATES: readonly ContractState[] = ["confirmed", "drifted", "unobserved"];
const KINDS: readonly Drift["kind"][] = ["undeclared", "type", "missing"];

const isState = (value: unknown): value is ContractState => STATES.some((state) => state === value);
const isKind = (value: unknown): value is Drift["kind"] => KINDS.some((kind) => kind === value);

/**
 * Read the contract report Studio sent: each endpoint it can check, with
 * its state, its drift and the fields its schema should declare; an entry
 * Studio did not write whole is left out.
 *
 * @param value - What Studio answered
 * @returns The endpoints' contracts
 * @example
 * ```ts
 * contractsOf(await post("/api/contract/report")).filter((c) => c.state === "drifted");
 * ```
 */
export function contractsOf(value: unknown): EndpointContract[] {
  if (!isPlainObject(value) || !Array.isArray(value.endpoints)) return [];
  return value.endpoints.flatMap((entry): EndpointContract[] => {
    if (!isPlainObject(entry) || !isState(entry.state)) return [];
    if (typeof entry.source !== "string" || typeof entry.endpoint !== "string") return [];
    return [
      {
        source: entry.source,
        endpoint: entry.endpoint,
        state: entry.state,
        calls: numberOf(entry.calls),
        lastSeen: typeof entry.lastSeen === "number" ? entry.lastSeen : undefined,
        cut: numberOf(entry.cut),
        drift: Array.isArray(entry.drift) ? entry.drift.flatMap(driftOf) : [],
        fix: Array.isArray(entry.fix)
          ? entry.fix
              .filter(isPlainObject)
              .map((fix) => ({ within: String(fix.within), line: String(fix.line) }))
          : [],
      },
    ];
  });
}

function driftOf(value: unknown): Drift[] {
  if (!isPlainObject(value) || typeof value.path !== "string" || !isKind(value.kind)) return [];
  return [
    {
      path: value.path,
      kind: value.kind,
      observed: strings(value.observed),
      declared: Array.isArray(value.declared) ? strings(value.declared) : undefined,
      firstSeen: numberOf(value.firstSeen),
      lastSeen: numberOf(value.lastSeen),
      count: numberOf(value.count),
      places: strings(value.places),
    },
  ];
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
