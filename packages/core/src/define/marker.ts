import type { HttpMethod } from "../http-client/types";
import type { SchemaMetadata } from "../validation";
import type { ResolvedEndpointOptions } from "./options";
import type { AnyProbe } from "./probe";

/**
 * Phantom key carrying an endpoint's type information.
 *
 * Declared but never given a value, so a descriptor can only be produced by a
 * builder terminal. Consumers read the carrier through the `Infer*` helpers
 * rather than touching this key directly.
 */
declare const ENDPOINT: unique symbol;

export type EndpointMarker = typeof ENDPOINT;

/**
 * Runtime metadata key stamped on every descriptor.
 *
 * Shared by the mock generator, the studio codegen and the request executor,
 * which all read schema information without importing the define module.
 */
export const ENDPOINT_SCHEMA: unique symbol = Symbol.for("courier.endpoint.schema");

/** Declared semantics of an endpoint, chosen by the builder head. */
export type EndpointKind = "query" | "mutation" | "stream" | "channel";

/**
 * Flat, precomputed type carrier.
 *
 * Every field is resolved at the terminal call, so a consumer reads one
 * indexed access instead of re-deriving shapes on each use. `call` holds the
 * finished call signature, which keeps client access independent of how many
 * slots the endpoint declared.
 */
export interface EndpointTypes<
  TResponse,
  TVariables,
  TVariablesOut,
  TSend,
  TKind extends EndpointKind,
> {
  readonly response: TResponse;
  /** What the caller passes. */
  readonly variables: TVariables;
  /** What the closure receives, once a schema has validated what was passed. */
  readonly variablesOut: TVariablesOut;
  /** What the caller may send inside an open channel. */
  readonly send: TSend;
  readonly kind: TKind;
}

/**
 * Widest carrier every concrete {@link EndpointTypes} is assignable to.
 *
 * Each slot sits in a covariant readonly position, so this stays assignable
 * without `any` and without a conditional type.
 */
export interface AnyEndpointTypes {
  readonly response: unknown;
  readonly variables: unknown;
  readonly variablesOut: unknown;
  readonly send: unknown;
  readonly kind: EndpointKind;
}

/**
 * An endpoint descriptor.
 *
 * Inert data rather than a callable: the wire shape is captured once by the
 * probe at definition time, and the client proxy builds the callable from
 * `call` when the endpoint is reached through a caller.
 */
export interface Endpoint<T extends AnyEndpointTypes> {
  readonly [ENDPOINT]: T;
  readonly [ENDPOINT_SCHEMA]: SchemaMetadata;
  readonly kind: T["kind"];
  /** Captured by probing the wire closure when the endpoint was defined. */
  readonly method: HttpMethod;
  /** Captured by probing the wire closure when the endpoint was defined. */
  readonly path: string;
  /** Retained so the wire shape can be re-derived without a definition site. */
  readonly probe: AnyProbe;
  /**
   * Is the closure the implementation, rather than a description of a wire?
   *
   * `.implement()` sets it; `.via()` clears it. A stream or channel server
   * then relays an endpoint that only describes where to connect, instead of
   * invoking its closure as a generator and failing on the result.
   */
  readonly served: boolean;
  readonly options: ResolvedEndpointOptions;
}

/** Any endpoint descriptor, whatever it declared. */
export type AnyEndpoint = Endpoint<AnyEndpointTypes>;

export type InferResponse<E extends AnyEndpoint> = E[EndpointMarker]["response"];
export type InferVariables<E extends AnyEndpoint> = E[EndpointMarker]["variables"];
/** What the endpoint's closure receives, after a schema has validated the call. */
export type InferVariablesOut<E extends AnyEndpoint> = E[EndpointMarker]["variablesOut"];
export type InferSend<E extends AnyEndpoint> = E[EndpointMarker]["send"];
export type InferKind<E extends AnyEndpoint> = E[EndpointMarker]["kind"];
