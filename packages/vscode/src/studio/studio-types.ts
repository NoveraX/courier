/** How an endpoint's calls went, as Studio tells an editor. */
export interface EndpointStats {
  readonly source: string;
  readonly endpoint: string;
  /** What it does — a stream's or a channel's calls are its connections; an older Studio leaves it out */
  readonly kind?: "query" | "mutation" | "stream" | "channel" | undefined;
  readonly calls: number;
  readonly failed: number;
  readonly pending: number;
  readonly statuses: Readonly<Record<string, number>>;
  readonly p50?: number | undefined;
  readonly p95?: number | undefined;
  readonly lastAt?: number | undefined;
  /** The latest failure, why, and the request Studio's inspector opens it as — an older Studio names none */
  readonly lastFailure?:
    | {
        readonly at: number;
        readonly status?: number;
        readonly message: string;
        readonly request?: string | undefined;
      }
    | undefined;
}

/** An endpoint as a call names it: its source and its call in the client. */
export interface EndpointName {
  readonly source: string;
  /** `orders.place` */
  readonly endpoint: string;
}

/** A call to an endpoint in a file, as Studio placed it: lines and columns from 1. */
export interface EndpointCall {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly endpoints: readonly EndpointName[];
}

/** Where the project's code calls an endpoint, as Studio indexed it. */
export interface CallSite {
  /** The file, relative to the project's root */
  readonly file: string;
  /** Its absolute path, which the editor opens */
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** The line as written, trimmed */
  readonly code: string;
}

/** A finding of Studio's audit that concerns endpoints, placed at their calls. */
export interface Finding {
  readonly id: string;
  readonly severity: "error" | "warning" | "hint";
  readonly title: string;
  readonly description: string;
  readonly suggestion?: string | undefined;
  readonly endpoints: readonly (EndpointName & { readonly detail?: string | undefined })[];
}
