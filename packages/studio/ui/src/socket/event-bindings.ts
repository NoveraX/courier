import type { Socket } from "socket.io-client"

import type { StudioState } from "@/store/store-types"
import type { StudioEvent } from "@/store/types-events"

import { handleMockEvent, isMockEvent } from "@/store/handle-mock-events"
import { isStudioEvent } from "./event-guards"
import { createEventQueue } from "./event-queue"

/** The part of the store runtime events write. */
export type EventsStore = Pick<StudioState, "handleEvents" | "replayEvents">

type EventPayload = StudioEvent & Record<string, unknown>

/**
 * Listen for runtime events: each live `event` as it arrives, gathered into
 * batches, and the `events:replay` Studio sends on connect with the requests
 * it captured before. A mock-server event goes to the mock store at once.
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
  const queue = createEventQueue<EventPayload>((batch) => store().handleEvents(batch))

  const onEvent = (event: unknown): void => {
    if (!isStudioEvent(event)) return
    if (isMockEvent(event.type)) handleMockEvent(event)
    else queue.push(event)
  }
  /* Live events queued before the replay arrived belong before it. */
  const onReplay = (data: unknown): void => {
    if (!Array.isArray(data)) return
    queue.flush()
    store().replayEvents(data.filter((e): e is EventPayload => isStudioEvent(e) && !isMockEvent(e.type)))
  }

  socket.on("event", onEvent)
  socket.on("events:replay", onReplay)
  return () => {
    socket.off("event", onEvent)
    socket.off("events:replay", onReplay)
    queue.flush()
  }
}
