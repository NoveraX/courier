import type { PlacedEndpoint } from "@noverax/courier/internal";
import { eachEndpoint, isDefinedApi, standardJsonSchema } from "@noverax/courier/internal";

import type { AnswerObservations } from "../storage/answer-observations";
import { type DeclaredShape, declaredShapeOf } from "./declared-shape";
import { type ContractState, type Drift, endpointDrift } from "./endpoint-drift";
import { type SchemaFix, schemaFix } from "./schema-fix";

/** How one endpoint's real answers stand against its response schema. */
export interface EndpointContract {
  source: string;
  /** Its call in the client: `products.get` */
  endpoint: string;
  state: ContractState;
  /** How many answers were seen */
  calls: number;
  lastSeen: number | undefined;
  /** How many answers were too large or too deep to see whole */
  cut: number;
  drift: Drift[];
  /** The fields its schema should declare so the answers fit it */
  fix: SchemaFix[];
  /** The library its response schema is written with, as Standard Schema names it: `zod` */
  vendor: string;
}

/** An endpoint's response schema. */
type ResponseSchema = NonNullable<PlacedEndpoint["schemas"]["response"]>;

/* A schema's declared shape is read once, however often the report is asked for. */
const declaredCache = new WeakMap<ResponseSchema, DeclaredShape>();

/**
 * How each endpoint with a response schema stands against its real answers:
 * confirmed by traffic, drifted from its schema — each difference with when
 * it was first and last seen, how often and from where, and the fields the
 * schema should declare — or not yet observed. Streams and channels are left
 * out; so is an endpoint whose schema cannot be written as JSON Schema.
 *
 * @param sources - The sources the config declares
 * @param observations - What their answers were seen to hold
 * @returns One entry per endpoint, drifted ones first
 * @example
 * ```ts
 * contractReport(running.config.sources, stores.answers).filter((e) => e.state === "drifted");
 * ```
 */
export function contractReport(
  sources: Readonly<Record<string, unknown>>,
  observations: AnswerObservations,
): EndpointContract[] {
  const report: EndpointContract[] = [];
  for (const [source, api] of Object.entries(sources)) {
    if (!isDefinedApi(api)) continue;
    for (const endpoint of eachEndpoint(api)) {
      const schema = endpoint.schemas.response;
      if (!schema || endpoint.kind === "stream" || endpoint.kind === "channel") continue;
      const declared = declaredOf(schema);
      if (!declared) continue;
      const seen = observations.of(source, endpoint.id);
      const { state, drift } = endpointDrift(seen, declared);
      report.push({
        source,
        endpoint: endpoint.id,
        state,
        calls: seen?.calls ?? 0,
        lastSeen: seen?.lastSeen,
        cut: seen?.cut ?? 0,
        drift,
        fix: schemaFix(drift, seen?.calls ?? 0, schema["~standard"].vendor),
        vendor: schema["~standard"].vendor,
      });
    }
  }
  const order: Record<ContractState, number> = { drifted: 0, confirmed: 1, unobserved: 2 };
  return report.sort((a, b) => order[a.state] - order[b.state]);
}

function declaredOf(schema: ResponseSchema): DeclaredShape | undefined {
  const cached = declaredCache.get(schema);
  if (cached) return cached;
  const json = standardJsonSchema(schema, "input");
  if (json === undefined) return undefined;
  const declared = declaredShapeOf(json);
  declaredCache.set(schema, declared);
  return declared;
}
