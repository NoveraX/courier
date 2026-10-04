import { studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  HttpFetchEndEvent,
  HttpFetchErrorEvent,
  HttpFetchStartEvent,
} from "../../events";
import type { HttpVersions } from "../http-versions/http-version";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire fetch lifecycle hooks to the bus */
export function wireFetchHooks(
  bus: EventBus,
  sessionId: string,
  versions?: HttpVersions | undefined,
): void {
  /* The URL each request in flight went to, to tell the version it went over once it answers. */
  const urls = new Map<string, string>();
  studioHooks.onHttpFetchStart = (e) => {
    urls.set(e.requestId, e.url);
    bus.emit(
      createEvent<HttpFetchStartEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:start",
        timestamp: e.timestamp,
        requestId: e.requestId,
        url: e.url,
        method: e.method,
      }),
    );
  };

  studioHooks.onHttpFetchEnd = (e) => {
    const url = urls.get(e.requestId);
    urls.delete(e.requestId);
    const httpVersion = url === undefined ? undefined : versions?.versionOf(url);
    bus.emit(
      createEvent<HttpFetchEndEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:end",
        timestamp: e.timestamp,
        requestId: e.requestId,
        status: e.status,
        duration: e.duration,
        ...(httpVersion && { httpVersion }),
      }),
    );
  };

  studioHooks.onHttpFetchError = (e) => {
    const url = urls.get(e.requestId);
    urls.delete(e.requestId);
    /* Only an answer came over a version; a fetch that never reached the upstream did not. */
    const httpVersion =
      e.status === undefined || url === undefined ? undefined : versions?.versionOf(url);
    bus.emit(
      createEvent<HttpFetchErrorEvent>(sessionId, {
        id: e.requestId,
        type: "http:fetch:error",
        timestamp: e.timestamp,
        requestId: e.requestId,
        message: e.message,
        ...(e.status !== undefined && { status: e.status }),
        ...(httpVersion && { httpVersion }),
      }),
    );
  };
}
