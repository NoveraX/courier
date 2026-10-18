import { studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  StreamCloseEvent,
  StreamErrorEvent,
  StreamMessageEvent,
  StreamOpenEvent,
  StreamStatusEvent,
} from "../../events";
import { readCause } from "../../events/read-cause";
import { boundedText } from "../bounded-text";
import { trackWSStream, untrackWSStream } from "../ws-tracking";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire stream (SSE/WS) hooks to the bus */
export function wireStreamHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
): void {
  studioHooks.onStreamOpen = (e) => {
    const source = resolveSourceName(e.source);

    bus.emit(
      createEvent<StreamOpenEvent>(sessionId, {
        id: e.requestId,
        type: "stream:open",
        timestamp: e.timestamp,
        requestId: e.requestId,
        source,
        group: e.group,
        method: e.method,
        transport: e.transport,
        mode: e.mode,
        ...(e.requestHeaders && { requestHeaders: e.requestHeaders }),
        ...(e.responseHeaders && { responseHeaders: e.responseHeaders }),
      }),
    );
  };

  studioHooks.onStreamMessage = (e) => {
    bus.emit(
      createEvent<StreamMessageEvent>(sessionId, {
        id: e.requestId,
        type: "stream:message",
        timestamp: e.timestamp,
        requestId: e.requestId,
        seq: e.seq,
        eventType: e.eventType,
        dataSize: e.dataSize,
        ...(e.dataPreview !== undefined && { dataPreview: e.dataPreview }),
      }),
    );
  };

  studioHooks.onStreamClose = (e) => {
    bus.emit(
      createEvent<StreamCloseEvent>(sessionId, {
        id: e.requestId,
        type: "stream:close",
        timestamp: e.timestamp,
        requestId: e.requestId,
        reason: e.reason,
        eventCount: e.eventCount,
        totalBytes: e.totalBytes,
        duration: e.duration,
      }),
    );
  };

  studioHooks.onStreamError = (e) => {
    bus.emit(
      createEvent<StreamErrorEvent>(sessionId, {
        id: e.requestId,
        type: "stream:error",
        timestamp: e.timestamp,
        requestId: e.requestId,
        error: boundedText(e.error),
      }),
    );
  };

  /* The cause goes as the platform said it, in the shape a request's takes;
     Studio cuts what leaves the page that holds its token. */
  studioHooks.onStreamStatus = (e) => {
    const cause = readCause(e.cause);
    bus.emit(
      createEvent<StreamStatusEvent>(sessionId, {
        id: e.requestId,
        type: "stream:status",
        timestamp: e.timestamp,
        requestId: e.requestId,
        status: e.status,
        ...(e.openedBefore !== undefined && { openedBefore: e.openedBefore }),
        ...(e.failures !== undefined && { failures: e.failures }),
        ...(e.retryIn !== undefined && { retryIn: e.retryIn }),
        ...(cause && { cause }),
      }),
    );
  };

  // Wire WS playground stream tracking
  studioHooks.onWSTrack = (e) => {
    trackWSStream(e.requestId, e.connectionId, e.topic);
  };

  studioHooks.onWSUntrack = (e) => {
    untrackWSStream(e.requestId);
  };
}
