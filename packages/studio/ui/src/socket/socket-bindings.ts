import type { Socket } from "socket.io-client";
import type { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { notifyFileChange } from "@/store/watcher-notifications";
import { bindApis } from "./apis-bindings";
import { bindEvents } from "./event-bindings";
import { isPlainObject } from "./is-plain-object";
import { bindPageState } from "./page-state-bindings";
import {
  isPlaygroundChunkPayload,
  isPlaygroundEndPayload,
  isPlaygroundErrorPayload,
} from "./playground-guards";
import { bindReadOnly } from "./read-only-bindings";
import { readWatcherChange } from "./read-watcher-change";
import { bindRuntimes } from "./runtime-bindings";
import { bindStorageCleared } from "./storage-cleared-bindings";
import { isStudioInfo } from "./studio-info-guard";

export interface Bindings {
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnectAttempt: (attempt: number) => void;
  onReconnect: () => void;
  onConnectError: () => void;
  onStudioInfo: (data: unknown) => void;
  onWatcherStatus: (data: unknown) => void;
  onWatcherChange: (data: unknown) => void;
  onPlaygroundChunk: (data: unknown) => void;
  onPlaygroundEnd: (data: unknown) => void;
  onPlaygroundError: (data: unknown) => void;
  /** Removes the listeners for what Studio says of the runtimes (`bindRuntimes`). */
  unbindRuntimes: () => void;
  /** Removes the listeners for the project Studio runs (`bindApis`). */
  unbindApis: () => void;
  /** Removes the listeners for runtime events (`bindEvents`). */
  unbindEvents: () => void;
  /** Removes the listener for the changes Studio refused (`bindReadOnly`). */
  unbindReadOnly: () => void;
  /** Removes the listener for what Settings → Storage cleared (`bindStorageCleared`). */
  unbindStorage: () => void;
  /** Removes the listeners for what the page keeps in the project (`bindPageState`). */
  unbindPageState: () => void;
}

export function buildBindings(s: Socket, store: typeof useStudioStore.getState): Bindings {
  const b: Bindings = {
    onConnect: () => {
      useMockStore.getState().forgetManagedServers();
      store().setConnectionStatus("connected");
    },
    onDisconnect: () => store().setConnectionStatus("disconnected"),
    onReconnectAttempt: (attempt) => {
      store().setConnectionStatus("reconnecting");
      store().setReconnectAttempt(attempt);
    },
    onReconnect: () => store().setConnectionStatus("connected"),
    onConnectError: () => store().setConnectionStatus("disconnected"),
    onStudioInfo: (data) => {
      if (isStudioInfo(data)) store().setStudioInfo(data);
    },
    onWatcherStatus: (data) => {
      if (
        isPlainObject(data) &&
        typeof data.apiPaths === "number" &&
        typeof data.since === "number" &&
        Number.isFinite(data.since)
      ) {
        store().setWatcherStatus(data.apiPaths, data.since);
      }
    },
    onWatcherChange: (data) => {
      const change = readWatcherChange(data);
      if (!change) return;
      store().setWatcherChange(change);
      notifyFileChange(change.source, change.files, store);
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
    unbindRuntimes: bindRuntimes(s, store),
    unbindApis: bindApis(s, store),
    unbindEvents: bindEvents(s, store),
    unbindReadOnly: bindReadOnly(s),
    unbindStorage: bindStorageCleared(s, store),
    unbindPageState: bindPageState(s),
  };

  s.on("connect", b.onConnect);
  s.on("disconnect", b.onDisconnect);
  s.io.on("reconnect_attempt", b.onReconnectAttempt);
  s.io.on("reconnect", b.onReconnect);
  s.on("connect_error", b.onConnectError);
  s.on("studio:info", b.onStudioInfo);
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
  s.off("studio:info", b.onStudioInfo);
  s.off("watcher:status", b.onWatcherStatus);
  s.off("watcher:change", b.onWatcherChange);
  s.off("playground:chunk", b.onPlaygroundChunk);
  s.off("playground:end", b.onPlaygroundEnd);
  s.off("playground:error", b.onPlaygroundError);
  b.unbindRuntimes();
  b.unbindApis();
  b.unbindEvents();
  b.unbindReadOnly();
  b.unbindStorage();
  b.unbindPageState();
}
