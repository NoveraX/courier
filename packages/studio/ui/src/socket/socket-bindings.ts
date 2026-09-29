import type { Socket } from "socket.io-client";
import type { useStudioStore } from "@/store";
import { showBindingErrorToast, showDuplicateRuntimeToast } from "@/store/binding-error-toast";
import { notifyFileChange } from "@/store/watcher-notifications";
import { bindApis } from "./apis-bindings";
import { isBindingErrorPayload, isBindingSnapshot } from "./binding-guards";
import { bindEvents } from "./event-bindings";
import { isPlainObject } from "./is-plain-object";
import {
  isPlaygroundChunkPayload,
  isPlaygroundEndPayload,
  isPlaygroundErrorPayload,
} from "./playground-guards";
import { bindReadOnly } from "./read-only-bindings";

export interface Bindings {
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnectAttempt: (attempt: number) => void;
  onReconnect: () => void;
  onConnectError: () => void;
  onBindingSnapshot: (data: unknown) => void;
  onBindingError: (data: unknown) => void;
  onRuntimeDuplicate: (data: unknown) => void;
  onWatcherStatus: (data: unknown) => void;
  onWatcherChange: (data: unknown) => void;
  onPlaygroundChunk: (data: unknown) => void;
  onPlaygroundEnd: (data: unknown) => void;
  onPlaygroundError: (data: unknown) => void;
  /** Removes the listeners for the project Studio runs (`bindApis`). */
  unbindApis: () => void;
  /** Removes the listeners for runtime events (`bindEvents`). */
  unbindEvents: () => void;
  /** Removes the listener for the changes Studio refused (`bindReadOnly`). */
  unbindReadOnly: () => void;
}

export function buildBindings(s: Socket, store: typeof useStudioStore.getState): Bindings {
  const b: Bindings = {
    onConnect: () => store().setConnectionStatus("connected"),
    onDisconnect: () => store().setConnectionStatus("disconnected"),
    onReconnectAttempt: (attempt) => {
      store().setConnectionStatus("reconnecting");
      store().setReconnectAttempt(attempt);
    },
    onReconnect: () => store().setConnectionStatus("connected"),
    onConnectError: () => store().setConnectionStatus("disconnected"),
    onBindingSnapshot: (data) => {
      if (!isBindingSnapshot(data)) return;
      store().setBindingSnapshot(data);
    },
    onBindingError: (data) => {
      if (!isBindingErrorPayload(data)) return;
      store().setBindingError(data);
      showBindingErrorToast(data);
    },
    onRuntimeDuplicate: (data) => {
      if (isPlainObject(data) && typeof data.runtimeId === "string")
        showDuplicateRuntimeToast(data.runtimeId);
    },
    onWatcherStatus: (data) => {
      if (data && typeof data === "object" && "apiPaths" in data) {
        const d = data as { apiPaths: number; mockFiles: number };
        store().setWatcherStatus(d.apiPaths, d.mockFiles);
      }
    },
    onWatcherChange: (data) => {
      if (data && typeof data === "object" && "source" in data) {
        const d = data as {
          source: "api" | "mock";
          files: string[];
          timestamp: number;
        };
        store().setWatcherChange(d);
        notifyFileChange(d.source, d.files, store);
      }
    },
    onPlaygroundChunk: (data) => {
      if (!isPlaygroundChunkPayload(data)) return;
      store().appendPlaygroundChunk(data.rid, data.chunk);
    },
    onPlaygroundEnd: (data) => {
      if (!isPlaygroundEndPayload(data)) return;
      store().endPlayground(data.rid, data.summary);
    },
    onPlaygroundError: (data) => {
      if (!isPlaygroundErrorPayload(data)) return;
      store().errorPlayground(data.rid, data.error);
    },
    unbindApis: bindApis(s, store),
    unbindEvents: bindEvents(s, store),
    unbindReadOnly: bindReadOnly(s),
  };

  s.on("connect", b.onConnect);
  s.on("disconnect", b.onDisconnect);
  s.io.on("reconnect_attempt", b.onReconnectAttempt);
  s.io.on("reconnect", b.onReconnect);
  s.on("connect_error", b.onConnectError);
  s.on("binding:snapshot", b.onBindingSnapshot);
  s.on("binding:error", b.onBindingError);
  s.on("runtime:duplicate", b.onRuntimeDuplicate);
  s.on("watcher:status", b.onWatcherStatus);
  s.on("watcher:change", b.onWatcherChange);
  s.on("playground:chunk", b.onPlaygroundChunk);
  s.on("playground:end", b.onPlaygroundEnd);
  s.on("playground:error", b.onPlaygroundError);

  return b;
}

export function unbind(s: Socket, b: Bindings): void {
  s.off("connect", b.onConnect);
  s.off("disconnect", b.onDisconnect);
  s.io.off("reconnect_attempt", b.onReconnectAttempt);
  s.io.off("reconnect", b.onReconnect);
  s.off("connect_error", b.onConnectError);
  s.off("binding:snapshot", b.onBindingSnapshot);
  s.off("binding:error", b.onBindingError);
  s.off("runtime:duplicate", b.onRuntimeDuplicate);
  s.off("watcher:status", b.onWatcherStatus);
  s.off("watcher:change", b.onWatcherChange);
  s.off("playground:chunk", b.onPlaygroundChunk);
  s.off("playground:end", b.onPlaygroundEnd);
  s.off("playground:error", b.onPlaygroundError);
  b.unbindApis();
  b.unbindEvents();
  b.unbindReadOnly();
}
