/**
 * Store mutation emitters — incremental change events and full
 * snapshot pushes after store-mutation commands.
 */

import type { BridgeContext } from "../types";
import type { EmitFn } from "./types";

export function createStoreEmitters(emit: EmitFn, ctx: BridgeContext) {
  return {
    emitStoreChange(
      collection: string,
      operation: "create" | "update" | "delete" | "seed" | "clear",
      record: unknown,
      count: number,
    ) {
      emit("mock:store:change", { collection, operation, record, count });
    },

    emitStoreSnapshot() {
      const store = ctx.server.store;
      const collections = store.list().map((name) => ({
        name,
        count: store.collection(name).count(),
        records: store.collection(name).getAll(),
      }));
      emit("mock:store:snapshot", { collections });
    },
  };
}
