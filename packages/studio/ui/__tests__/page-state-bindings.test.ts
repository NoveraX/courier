/**
 * @vitest-environment jsdom
 *
 * What a page keeps in the project: Studio sends it as the page connects,
 * with whether the page may change it; the page takes it, sends its own
 * changes only when it may, seeds a project that keeps nothing yet with
 * what its browser kept, and follows what other pages change — pins too.
 */
import type { Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSetupStore } from "@/features/welcome/setup-store";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { bindPageState } from "@/socket/page-state-bindings";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/store/constants";
import { requestEntry } from "./request-entry-fixture";

function fakeSocket() {
  const handlers = new Map<string, (raw: unknown) => void>();
  const emit = vi.fn();
  const socket = {
    emit,
    on: (event: string, handler: (raw: unknown) => void) => handlers.set(event, handler),
    off: vi.fn(),
  };
  return { socket: socket as unknown as Socket, handlers, emit };
}

let unbind: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  useStudioStore.setState({ settings: DEFAULT_SETTINGS, requests: [], projectWritable: false });
  useSetupStore.setState({ frameworkId: null, copied: new Set(), completed: false });
  usePlaygroundDrafts.setState({ variables: {}, headers: undefined, mode: "direct" });
});

afterEach(() => {
  unbind();
  vi.useRealTimers();
});

const sets = (emit: ReturnType<typeof vi.fn>) =>
  emit.mock.calls.filter(([event]) => event === "page:state:set").map(([, payload]) => payload);

describe("a page's state kept in the project", () => {
  it("takes what the project keeps, and says the settings are kept there", () => {
    const { socket, handlers } = fakeSocket();
    unbind = bindPageState(socket);

    handlers.get("page:state")?.({
      writable: true,
      state: {
        settings: { ...DEFAULT_SETTINGS, theme: "light", jsonIndent: 4 },
        setup: { frameworkId: "nextjs", copied: ["install"], completed: true },
        "playground.drafts": { variables: { "api.users.list": '{"page":2}' }, mode: "proxy" },
      },
    });

    expect(useStudioStore.getState()).toMatchObject({
      projectWritable: true,
      settings: { theme: "light", jsonIndent: 4 },
    });
    expect(useSetupStore.getState()).toMatchObject({ frameworkId: "nextjs", completed: true });
    expect([...useSetupStore.getState().copied]).toEqual(["install"]);
    expect(usePlaygroundDrafts.getState()).toMatchObject({
      variables: { "api.users.list": '{"page":2}' },
      mode: "proxy",
    });
  });

  it("seeds a project that keeps nothing yet with what this browser kept, and nothing more", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, jsonIndent: 4 }),
    );
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, jsonIndent: 4 } });
    const { socket, handlers, emit } = fakeSocket();
    unbind = bindPageState(socket);

    handlers.get("page:state")?.({ writable: true, state: {} });
    vi.runAllTimers();

    expect(sets(emit)).toEqual([
      { key: "settings", value: expect.objectContaining({ jsonIndent: 4 }) },
    ]);
  });

  it("sends its changes once it may, the drafts once typing pauses, and none of what it is sent", () => {
    const { socket, handlers, emit } = fakeSocket();
    unbind = bindPageState(socket);
    handlers.get("page:state")?.({ writable: true, state: { settings: DEFAULT_SETTINGS } });
    emit.mockClear();

    useStudioStore.getState().updateSettings({ jsonIndent: 4 });
    usePlaygroundDrafts.getState().setVariables("api.users.list", "{");
    usePlaygroundDrafts.getState().setVariables("api.users.list", "{}");
    handlers.get("page:state:changed")?.({ key: "setup", value: { frameworkId: "vite" } });
    vi.runAllTimers();

    expect(sets(emit)).toEqual([
      { key: "settings", value: expect.objectContaining({ jsonIndent: 4 }) },
      {
        key: "playground.drafts",
        value: { variables: { "api.users.list": "{}" }, mode: "direct" },
      },
    ]);
    expect(useSetupStore.getState().frameworkId).toBe("vite");
  });

  it("keeps the changes of a page without the token to itself", () => {
    const { socket, handlers, emit } = fakeSocket();
    unbind = bindPageState(socket);
    handlers.get("page:state")?.({ writable: false, state: {} });

    useStudioStore.getState().updateSettings({ jsonIndent: 4 });
    vi.runAllTimers();

    expect(sets(emit)).toEqual([]);
    expect(useStudioStore.getState().projectWritable).toBe(false);
  });

  it("pins the requests the project keeps pinned, and follows another page's pin", () => {
    useStudioStore.setState({ requests: [requestEntry({ id: "a" }), requestEntry({ id: "b" })] });
    const { socket, handlers } = fakeSocket();
    unbind = bindPageState(socket);

    handlers.get("requests:pinned")?.(["a"]);
    handlers.get("requests:pinned:changed")?.({ id: "b", pinned: true });
    handlers.get("requests:pinned:changed")?.({ id: "a", pinned: false });

    expect(useStudioStore.getState().requests.map((r) => [r.id, r.pinned === true])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});
