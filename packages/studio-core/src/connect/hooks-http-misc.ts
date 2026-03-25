import { studioHooks } from "@noverax/nexus";
import type { EventBus } from "../event-bus";
import type {
  AnyStudioEvent,
  DedupAbortEvent,
  DedupReuseEvent,
  UploadCompleteEvent,
  UploadProgressEvent,
} from "../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire dedup and upload hooks to the bus */
export function wireDedupUploadHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onDedupAbort = (e) => {
    bus.emit(
      createEvent<DedupAbortEvent>(sessionId, {
        id: e.requestId,
        type: "dedup:abort",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
      }),
    );
  };

  studioHooks.onDedupReuse = (e) => {
    bus.emit(
      createEvent<DedupReuseEvent>(sessionId, {
        id: e.requestId,
        type: "dedup:reuse",
        timestamp: e.timestamp,
        requestId: e.requestId,
        key: e.key,
      }),
    );
  };

  studioHooks.onUploadProgress = (e) => {
    bus.emit(
      createEvent<UploadProgressEvent>(sessionId, {
        id: e.requestId,
        type: "upload:progress",
        timestamp: e.timestamp,
        requestId: e.requestId,
        loaded: e.loaded,
        total: e.total,
        percentage: e.percentage,
      }),
    );
  };

  studioHooks.onUploadComplete = (e) => {
    bus.emit(
      createEvent<UploadCompleteEvent>(sessionId, {
        id: e.requestId,
        type: "upload:complete",
        timestamp: e.timestamp,
        requestId: e.requestId,
      }),
    );
  };
}
