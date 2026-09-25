/**
 * `bindApis` keeps the project Studio runs in the store: the imports list,
 * the source catalogue and how the config loads. The socket is a real
 * socket.io client that never connects; each test calls the listeners the
 * binding registered, as a packet from Studio would. The packets of a reload
 * come in the order Studio sends them: the watcher's change, the mocks
 * file's status when it changed, the lists, then the config's status.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

import type { Socket } from "socket.io-client";
import type { ApisStore } from "../src/socket/apis-bindings";
import type { ConfigStatusPayload } from "../src/store/config-status";
import type { MocksFileStatus } from "../src/store/mocks-file-status";

import { bindApis } from "../src/socket/apis-bindings";
import { DEFAULT_SETTINGS } from "../src/store/constants";

const LOADED: ConfigStatusPayload = {
  state: "loaded",
  revision: 2,
  configFile: "courier.config.ts",
  loadedAt: 1_000,
};
const FAILED: ConfigStatusPayload = {
  state: "failed",
  revision: 3,
  configFile: "courier.config.ts",
  error: { code: "CONFIG_INVALID", message: "Unexpected token (3:7)" },
  failedAt: 2_000,
  lastGoodAt: 1_000,
};
const MOCKS_FILE = "/p/courier.mocks.ts";
const SUMMARY = {
  name: "petstore",
  specUrl: "https://petstore.example/openapi.json",
  importType: "url",
  outputDir: "src/api/petstore",
  options: {},
};
const SOURCE = {
  name: "petstore",
  baseURL: "https://petstore.example",
  filePath: "src/api/petstore/source.ts",
  groups: [
    {
      name: "pets",
      prefix: "/pets",
      filePath: "src/api/petstore/pets/index.ts",
      endpoints: [
        {
          name: "list",
          analysis: {
            hasResponseType: true,
            hasVariablesType: false,
            hasValidation: true,
            httpMethod: "get",
            path: "/pets",
            type: "query",
          },
        },
      ],
    },
  ],
  isImported: true,
  hasClient: true,
};

function createStore(): ApisStore {
  const store: ApisStore = {
    configStatus: null,
    settings: DEFAULT_SETTINGS,
    setConfigStatus: vi.fn((status: ConfigStatusPayload | null) => {
      store.configStatus = status;
    }),
    mocksFileStatus: null,
    setMocksFileStatus: vi.fn((status: MocksFileStatus | null) => {
      store.mocksFileStatus = status;
    }),
    setRegistrySources: vi.fn(),
    setScanSources: vi.fn(),
  };
  return store;
}

function deliver(socket: Socket, event: string, payload?: unknown): void {
  const listeners = socket.listeners(event);
  expect(listeners.length).toBeGreaterThan(0);
  for (const listener of listeners) listener(payload);
}

function reloaded(revision: number, loadedAt: number): ConfigStatusPayload {
  return { state: "loaded", revision, configFile: "courier.config.ts", loadedAt };
}

let socket: Socket;
let store: ApisStore;
let unbind: () => void;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  socket = io("http://127.0.0.1:9", { autoConnect: false });
  store = createStore();
  unbind = bindApis(socket, () => store);
  for (const fn of Object.values(toast)) fn.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  unbind();
  socket.close();
  warn.mockRestore();
});

describe("bindApis", () => {
  it("keeps each config status Studio sends, and forgets it on disconnect", () => {
    deliver(socket, "config:status", LOADED);
    expect(store.configStatus).toEqual(LOADED);

    deliver(socket, "disconnect", "transport close");
    expect(store.configStatus).toBeNull();
  });

  it("drops a config status it does not understand", () => {
    deliver(socket, "config:status", LOADED);
    deliver(socket, "config:status", { state: "settling", revision: 3 });

    expect(store.configStatus).toEqual(LOADED);
  });

  it("says nothing for the status replayed after connecting", () => {
    deliver(socket, "config:status", FAILED);

    expect(store.configStatus).toEqual(FAILED);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("announces a config that stops loading", () => {
    deliver(socket, "config:status", LOADED);
    deliver(socket, "config:status", FAILED);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0]).toEqual([
      "courier.config stopped loading: Unexpected token (3:7)",
    ]);
  });

  it("announces a reload with the API change that caused it, whatever mocks changed since", () => {
    deliver(socket, "config:status", LOADED);
    deliver(socket, "watcher:change", {
      source: "api",
      files: ["/p/src/api.ts"],
      timestamp: 1_500,
    });
    deliver(socket, "watcher:change", { source: "mock", files: ["petstore"], timestamp: 1_600 });
    deliver(socket, "config:status", { ...LOADED, revision: 3, loadedAt: 2_000 });

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info.mock.calls[0]).toEqual(["API sources reloaded — /p/src/api.ts"]);
  });

  it("announces no reload for a save of the mocks file that does not load", () => {
    deliver(socket, "config:status", LOADED);
    deliver(socket, "mocks:status", { file: MOCKS_FILE, error: null });
    deliver(socket, "watcher:change", { source: "api", files: [MOCKS_FILE], timestamp: 1_500 });
    deliver(socket, "mocks:status", { file: MOCKS_FILE, error: "ParseError: Unexpected token" });
    deliver(socket, "config:status", reloaded(3, 2_000));

    expect(store.configStatus).toEqual(reloaded(3, 2_000));
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("announces no reload of the API sources for a save of the mocks file that loads", () => {
    deliver(socket, "config:status", LOADED);
    deliver(socket, "mocks:status", { file: MOCKS_FILE, error: null });
    deliver(socket, "watcher:change", { source: "api", files: [MOCKS_FILE], timestamp: 1_500 });
    deliver(socket, "config:status", reloaded(3, 2_000));

    expect(store.configStatus).toEqual(reloaded(3, 2_000));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("forgets the mocks file on disconnect", () => {
    deliver(socket, "mocks:status", { file: MOCKS_FILE, error: "ParseError: Unexpected token" });
    deliver(socket, "disconnect", "transport close");
    deliver(socket, "config:status", LOADED);
    deliver(socket, "watcher:change", {
      source: "api",
      files: ["/p/src/api.ts"],
      timestamp: 1_500,
    });
    deliver(socket, "config:status", reloaded(3, 2_000));

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info.mock.calls[0]).toEqual(["API sources reloaded — /p/src/api.ts"]);
  });

  it("keeps how the mocks file loads for the Mocks view, and forgets it on disconnect", () => {
    const failing = { file: MOCKS_FILE, error: "ParseError: Unexpected token" };

    deliver(socket, "mocks:status", failing);
    expect(store.mocksFileStatus).toEqual(failing);

    deliver(socket, "mocks:status", { file: MOCKS_FILE, error: 42 });
    expect(store.mocksFileStatus).toEqual(failing);

    deliver(socket, "disconnect", "transport close");
    expect(store.mocksFileStatus).toBeNull();
  });

  it("stores the imports and the sources Studio sends", () => {
    deliver(socket, "registry:updated", { sources: [SUMMARY] });
    deliver(socket, "scan:sources", { sources: [SOURCE], scannedFiles: 1 });

    expect(store.setRegistrySources).toHaveBeenCalledWith([SUMMARY]);
    expect(store.setScanSources).toHaveBeenCalledWith([SOURCE]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("replaces the imports with the entries it can show, leaving out and logging the others", () => {
    const moved = { ...SUMMARY, specUrl: "https://petstore.example/v2.json" };
    const untyped = { name: "local", specUrl: "", outputDir: "src/local", options: {} };

    deliver(socket, "registry:updated", { sources: [SUMMARY] });
    deliver(socket, "registry:updated", { sources: [moved, untyped] });

    expect(store.setRegistrySources).toHaveBeenCalledTimes(2);
    expect(store.setRegistrySources).toHaveBeenLastCalledWith([moved]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toEqual(untyped);
  });

  it("replaces the sources with the entries it can show, leaving out and logging the others", () => {
    const broken = { ...SOURCE, name: "broken", groups: "pets" };

    deliver(socket, "scan:sources", { sources: [SOURCE, broken], scannedFiles: 2 });

    expect(store.setScanSources).toHaveBeenCalledWith([SOURCE]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toEqual(broken);
  });

  it("keeps the lists it has for a payload that carries none, and logs it", () => {
    deliver(socket, "registry:updated", { sources: "petstore" });
    deliver(socket, "scan:sources", null);

    expect(store.setRegistrySources).not.toHaveBeenCalled();
    expect(store.setScanSources).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("removes every listener it added", () => {
    unbind();

    const events = [
      "registry:updated",
      "scan:sources",
      "watcher:change",
      "mocks:status",
      "config:status",
    ];
    for (const event of events) {
      expect(socket.listeners(event)).toHaveLength(0);
    }
    expect(socket.listeners("disconnect")).toHaveLength(0);
  });
});
