import { studioHooks } from "@noverax/courier/internal";
import type { EventBus } from "../../event-bus";
import type {
  AnyStudioEvent,
  CallSupersededEvent,
  UploadCompleteEvent,
  UploadProgressEvent,
} from "../../events";

/** Create an event with session envelope */
const createEvent = <TEvent extends AnyStudioEvent>(
  sessionId: string,
  partial: Omit<TEvent, "sessionId">,
): TEvent => ({ ...partial, sessionId }) as TEvent;

/** Wire superseded-call and upload hooks to the bus */
export function wireSupersedeUploadHooks(bus: EventBus, sessionId: string): void {
  studioHooks.onCallSuperseded = (e) => {
    bus.emit(
      createEvent<CallSupersededEvent>(sessionId, {
        id: e.key,
        type: "call:superseded",
        timestamp: e.timestamp,
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
        ...(e.source !== undefined && { source: e.source }),
        ...(e.group !== undefined && { group: e.group }),
        ...(e.method !== undefined && { method: e.method }),
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
