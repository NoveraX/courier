import type { Context } from "../http-client/types";
import type { StudioHooks } from "../studio/hooks";
import type {
  FailureReport,
  RequestStart,
  StudioContext,
  TimingState,
} from "../utils/execute-studio";

/** The endpoint a call is for, as the call was made. */
export interface CallNames {
  source: unknown;
  group: unknown;
  method: unknown;
}

/** What a call's answer was, as Studio is told when the call ends. */
export interface CallAnswer {
  status: number;
  data: unknown;
  headers: Headers;
}

/**
 * Studio's view of the calls made where its runtime is attached — a
 * server, or a page whose bundle runs it. Studio's own runtime sets the
 * hooks and lends this view with them; what a call tells them, and how its
 * values are described to Studio, is built here, so a page that runs no
 * Studio carries none of it.
 */
export interface StudioCapability {
  /** The hooks Studio listens on, each told of one kind of event as it happens */
  readonly hooks: StudioHooks;
  /** A new id for a call Studio is told of */
  requestId(): string;
  /** Tell Studio a call started, its variables described as Studio's JSON carries them */
  requestStart(studio: StudioContext, start: RequestStart): void;
  /** Tell Studio a call was answered, and how its time was spent */
  requestEnd(
    studio: StudioContext,
    answer: CallAnswer,
    requestHeaders: Headers,
    timing: TimingState,
    tMiddlewareTotal: number,
    context: Context | undefined,
  ): void;
  /** Tell Studio a call failed: the kind of failure, its cause, and how its time was spent */
  requestError(error: unknown, report: FailureReport, status: number | undefined): void;
  /** Have a call's HTTP client tell Studio as its request is sent */
  watchFetch(
    instance: { onBeforeFetch?: (method: string, url: string) => void },
    studio: StudioContext,
    timing: TimingState,
  ): void;
  /** Mark a proxy's answer with the time the server took, for the page's network panel */
  timingHeaders(response: Response, requestId: string, t0: number): void;
  /** A direct call's options, its upload's progress told to Studio too */
  callUploads<TOptions extends object>(
    options: TOptions,
    studio: StudioContext,
    call: CallNames,
  ): TOptions;
  /** A proxy call's options, its upload's progress told to Studio under the id the proxy reports */
  proxyUploads(options: Record<string, unknown>): Record<string, unknown>;
  /** Tell Studio how a proxy call's time split between the way there and the server's work */
  proxyClientTiming(response: Response, t0: number, tHeaders: number): void;
}
