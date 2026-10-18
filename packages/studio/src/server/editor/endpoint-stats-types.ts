import type { CatalogEndpoint } from "./endpoint-catalog";

/** How an endpoint's calls went, as an editor shows it beside a call. */
export interface EndpointStats {
  readonly source: string;
  readonly endpoint: string;
  /** What it does: a stream's or a channel's calls are its connections */
  readonly kind: CatalogEndpoint["kind"];
  /** Calls Studio kept, finished or not — for a stream or a channel, the connections opened */
  readonly calls: number;
  /** The requests those calls sent: a read another call's request answered sent none; a call still waiting counts as one */
  readonly requests: number;
  /** Requests that failed */
  readonly failed: number;
  /** Calls still waiting for their answer — for a stream or a channel, the connections still open */
  readonly pending: number;
  /** How many requests ended with each status, `"failed"` for one that got none */
  readonly statuses: Readonly<Record<string, number>>;
  /** Half the finished calls that sent a request of their own took no longer, in milliseconds */
  readonly p50?: number | undefined;
  /** Nineteen in twenty of them took no longer */
  readonly p95?: number | undefined;
  /** When the latest call started */
  readonly lastAt?: number | undefined;
  /** The latest failed request, why, and the request Studio keeps it as — which its inspector opens */
  readonly lastFailure?:
    | {
        readonly at: number;
        readonly status?: number;
        readonly message: string;
        readonly request?: string;
      }
    | undefined;
}
