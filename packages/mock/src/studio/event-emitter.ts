import { createControlEmitters } from "./emitters/control-emitters";
import { createRequestEmitters } from "./emitters/request-emitters";
import { createSnapshotEmitters } from "./emitters/snapshot-emitters";
import { createStoreEmitters } from "./emitters/store-emitters";
import type { EmitFn } from "./emitters/types";
import type { BridgeContext } from "./types";

interface Socket {
  emit(event: string, data: unknown): void;
}

/** Creates an event emitter that sends mock:* events via Socket.IO */
export function createEventEmitter(socket: Socket, ctx: BridgeContext) {
  const emit: EmitFn = (type, payload) => {
    socket.emit("event", {
      id: `${ctx.sessionId}_${Date.now().toString(36)}`,
      type,
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
      serverId: ctx.serverId,
      ...payload,
    });
  };

  return {
    ...createSnapshotEmitters(emit, ctx),
    ...createRequestEmitters(emit, ctx),
    ...createStoreEmitters(emit, ctx),
    ...createControlEmitters(emit, ctx),
  };
}

/** Return type of createEventEmitter */
export type MockEventEmitter = ReturnType<typeof createEventEmitter>;
