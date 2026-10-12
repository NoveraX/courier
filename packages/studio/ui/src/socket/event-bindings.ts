import type { Socket } from "socket.io-client";
import { handleMockEvent, isMockEvent } from "@/store/handle-mock-events";
import type { StudioState } from "@/store/store-types";
import type { StudioEvent } from "@/store/types-events";
import { isStudioEvent } from "./event-guards";
import { createEventQueue } from "./event-queue";
import { replayMockEvents } from "./replay-mock-events";
import { replayedEvents } from "./replayed-events";
import { shownSessionOf } from "./shown-session-of";

/** The part of the store runtime events write. */
export type EventsStore = Pick<StudioState, "handleEvents" | "replayEvents" | "showSession">;

type EventPayload = StudioEvent & Record<string, unknown>;

/**
 * Listen for runtime events: the live `events` as they arrive — every
 * message a batch of them — gathered into batches a frame long, and the
 * `events:replay` Studio sends on connect with the requests it captured
 * before. A mock-server event goes to the mock store at once.
 * When the pages show a saved session, Studio sends it after the replay, as
 * `view:session`, and it is shown in place of the live requests. The
 * requests the mocks answered come as `mock:events:replay`.
 *
 * @param socket - The `/ui` socket
 * @param store - Reads the store's event actions
 * @returns Removes the listeners, applying the events still queued
 *
 * @example
 * ```ts
 * const unbindEvents = bindEvents(getSocket(), useStudioStore.getState);
 * // on teardown
 * unbindEvents();
 * ```
 */
export function bindEvents(socket: Socket, store: () => EventsStore): () => void {
  const queue = createEventQueue<EventPayload>((batch) => store().handleEvents(batch));

  const onEvent = (event: unknown): void => {
    if (!isStudioEvent(event)) return;
    if (isMockEvent(event.type)) handleMockEvent(event);
    else queue.push(event);
  };
  const onEvents = (events: unknown): void => {
    if (Array.isArray(events)) for (const event of events) onEvent(event);
  };
  /* Live events queued before the replay arrived belong before it. */
  const onReplay = (data: unknown): void => {
    const events = replayedEvents(data);
    if (!events) return;
    queue.flush();
    store().replayEvents(
      events.filter((e): e is EventPayload => isStudioEvent(e) && !isMockEvent(e.type)),
    );
  };

  const onView = (data: unknown): void => {
    const shown = shownSessionOf(data);
    if (!shown) return;
    queue.flush();
    store().showSession(shown.session, shown.requests);
  };

  const onMockReplay = (data: unknown): void => {
    const events = replayedEvents(data);
    if (events) replayMockEvents(events);
  };

  socket.on("events", onEvents);
  socket.on("events:replay", onReplay);
  socket.on("view:session", onView);
  socket.on("mock:events:replay", onMockReplay);
  return () => {
    socket.off("events", onEvents);
    socket.off("events:replay", onReplay);
    socket.off("view:session", onView);
    socket.off("mock:events:replay", onMockReplay);
    queue.flush();
  };
}
