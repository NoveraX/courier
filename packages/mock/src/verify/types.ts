/** Why a recorded call no longer fits the definition. */
export type RecordingProblemKind =
  | "endpoint-removed"
  | "method-changed"
  | "path-changed"
  | "variables-refused"
  | "answer-refused";

/** Where a value broke a schema, and what the schema says of it. */
export interface SchemaIssue {
  /** `items[2].price`, or `(root)` for the value itself */
  readonly path: string;
  readonly message: string;
}

/** A way a recorded call no longer fits the definition. */
export interface RecordingProblem {
  readonly kind: RecordingProblemKind;
  /** What changed, said in a sentence */
  readonly message: string;
  /** For a refusal, each place the schema refused */
  readonly issues?: readonly SchemaIssue[] | undefined;
}

/** One recorded call, checked against the definition as it is now. */
export interface RecordingCheck {
  /** The recording's place among those checked, from 1 */
  readonly at: number;
  /** The source the call was made to, when the recordings name one */
  readonly source?: string | undefined;
  /** The endpoint's call in the client: `orders.get` */
  readonly endpoint: string;
  /** What the call was: `shop orders.get · GET /orders/o_1 → 200` */
  readonly label: string;
  readonly status: number;
  /** How it no longer fits; empty while it still does */
  readonly problems: readonly RecordingProblem[];
  /**
   * What could not be checked, and why: a part recorded only in part, or an
   * answer a schema that reshapes what it reads refuses — which may be the
   * reshaping, not a change.
   */
  readonly unchecked: readonly string[];
}

/** How recordings are checked. */
export interface VerifyOptions {
  /**
   * Endpoints whose recordings are left unchecked, by their call in the
   * client — `orders.get` — with `*` for any part of it: `admin.*`. With
   * several sources, prefix the source: `payments:charges.create`.
   */
  readonly ignore?: readonly string[] | undefined;
}
