import type { Socket } from "socket.io-client";
import { useKeptImport } from "@/apis/kept-import";
import { useSetupStore } from "@/features/welcome/setup-store";
import { useKeptWizard } from "@/mocks/wizard/kept-wizard-store";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { isPlainObject } from "./is-plain-object";
import { applyValue, ownValue, PAGE_STATE_KEYS, type PageStateKey } from "./page-state-values";

/* Typing in the Playground is sent once it pauses, not with every key. */
const DRAFT_DELAY_MS = 500;

/**
 * Keep what this page sets in the project: its settings, Get started's
 * progress, the Playground's drafts, the mock wizard and the API import it
 * left unfinished, and the requests it pins. Studio sends what the project keeps
 * as the page connects, and whether the page may change it; a page opened
 * without the token keeps its changes to itself. What another page changes
 * this one follows, and a project that keeps nothing yet takes this page's
 * own — what its browser kept before.
 *
 * @param socket - The `/ui` socket
 * @returns Removes the listeners
 * @example
 * ```ts
 * const unbind = bindPageState(getSocket());
 * ```
 */
export function bindPageState(socket: Socket): () => void {
  let writable = false;
  let applying = false;
  const timers = new Map<PageStateKey, ReturnType<typeof setTimeout>>();

  const send = (key: PageStateKey, value: unknown, delay = 0): void => {
    if (!writable || applying || value === undefined) return;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => socket.emit("page:state:set", { key, value }), delay),
    );
  };
  const apply = (key: unknown, value: unknown): void => {
    applying = true;
    try {
      applyValue(key, value);
    } finally {
      applying = false;
    }
  };

  const onState = (raw: unknown): void => {
    if (!isPlainObject(raw)) return;
    writable = raw.writable === true;
    useStudioStore.setState({ projectWritable: writable });
    const kept = isPlainObject(raw.state) ? raw.state : {};
    for (const key of PAGE_STATE_KEYS) {
      if (kept[key] !== undefined) apply(key, kept[key]);
      else send(key, ownValue(key, true));
    }
  };
  const onChanged = (raw: unknown): void => {
    if (isPlainObject(raw)) apply(raw.key, raw.value);
  };
  /* The pins come after the requests a page is sent as it connects. */
  const onPinned = (raw: unknown): void => {
    if (Array.isArray(raw)) {
      useStudioStore.getState().setPinned(
        raw.filter((id): id is string => typeof id === "string"),
        true,
      );
    }
  };
  const onPinChanged = (raw: unknown): void => {
    if (!isPlainObject(raw) || typeof raw.id !== "string" || typeof raw.pinned !== "boolean")
      return;
    useStudioStore.getState().setPinned([raw.id], raw.pinned);
  };

  const unsubscribe = [
    useStudioStore.subscribe((s, previous) => {
      if (s.settings !== previous.settings) send("settings", ownValue("settings"));
    }),
    useSetupStore.subscribe(() => send("setup", ownValue("setup"))),
    usePlaygroundDrafts.subscribe(() =>
      send("playground.drafts", ownValue("playground.drafts"), DRAFT_DELAY_MS),
    ),
    useKeptWizard.subscribe(() => send("mocks.wizard", ownValue("mocks.wizard"), DRAFT_DELAY_MS)),
    useKeptImport.subscribe(() => send("apis.import", ownValue("apis.import"), DRAFT_DELAY_MS)),
  ];
  socket.on("page:state", onState);
  socket.on("page:state:changed", onChanged);
  socket.on("requests:pinned", onPinned);
  socket.on("requests:pinned:changed", onPinChanged);
  return () => {
    socket.off("page:state", onState);
    socket.off("page:state:changed", onChanged);
    socket.off("requests:pinned", onPinned);
    socket.off("requests:pinned:changed", onPinChanged);
    for (const stop of unsubscribe) stop();
    for (const timer of timers.values()) clearTimeout(timer);
  };
}
