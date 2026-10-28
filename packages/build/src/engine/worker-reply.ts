import type { RoutesReadErrorCode, RoutesReadErrorContext } from "./routes-read-error";
import type { RoutesSnapshot } from "./routes-snapshot";

/** What the process that read a project's routes answers: the routes, or why there are none. */
export type WorkerReply =
  | { readonly ok: true; readonly snapshot: RoutesSnapshot }
  | {
      readonly ok: false;
      readonly code: RoutesReadErrorCode;
      readonly message: string;
      readonly context: RoutesReadErrorContext;
      readonly stack?: string | undefined;
    };
