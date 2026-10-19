import type { Socket } from "socket.io-client";
import { showBindingErrorToast, showDuplicateRuntimeToast } from "@/store/binding-error-toast";
import type { StudioState } from "@/store/store-types";
import { isBindingErrorPayload, isBindingSnapshot } from "./binding-guards";
import { isPlainObject } from "./is-plain-object";

/** The part of the store what Studio says of the runtimes reaches. */
export type RuntimesStore = Pick<
  StudioState,
  "setBindingSnapshot" | "setBindingError" | "setReceived"
>;

/**
 * Listen for what Studio says of the runtimes attached: the binding table
 * as it stands, which it sends a page as it connects and again on every
 * change; a conflict over a source; and a second process that claims a
 * runtime id already in use. The first table ends the page's wait for the
 * runtimes, even one the page cannot read: Studio has said what it has.
 *
 * @param socket - The `/ui` socket
 * @param store - Reads the store's actions
 * @returns Removes the listeners
 * @example
 * ```ts
 * const unbindRuntimes = bindRuntimes(getSocket(), useStudioStore.getState);
 * ```
 */
export function bindRuntimes(socket: Socket, store: () => RuntimesStore): () => void {
  const onSnapshot = (data: unknown): void => {
    if (isBindingSnapshot(data)) store().setBindingSnapshot(data);
    store().setReceived("runtimes");
  };
  const onError = (data: unknown): void => {
    if (!isBindingErrorPayload(data)) return;
    store().setBindingError(data);
    showBindingErrorToast(data);
  };
  const onDuplicate = (data: unknown): void => {
    if (isPlainObject(data) && typeof data.runtimeId === "string")
      showDuplicateRuntimeToast(data.runtimeId);
  };
  socket.on("binding:snapshot", onSnapshot);
  socket.on("binding:error", onError);
  socket.on("runtime:duplicate", onDuplicate);
  return () => {
    socket.off("binding:snapshot", onSnapshot);
    socket.off("binding:error", onError);
    socket.off("runtime:duplicate", onDuplicate);
  };
}
