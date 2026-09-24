/**
 * How Studio runs a managed mock server's process, and what it hears back.
 *
 * Studio forks its own worker with no loader flags, from the project's
 * directory, with the worker's output in Studio's terminal. An exit Studio
 * did not ask for — a signal, or an exit of the worker's own, with any code —
 * is reported. A stop resolves once the worker has exited and leaves no timer
 * behind, and the worker it replaced cannot take a new worker's place. The
 * host keeps its own signal handlers.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeChild extends EventEmitter {
  pid: number;
  connected: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  send: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
}

const forks: Array<{ script: string; options: Record<string, unknown>; child: FakeChild }> = [];
let obedient = true;

function exit(child: FakeChild, code: number | null, signal: NodeJS.Signals | null): void {
  child.exitCode = code;
  child.signalCode = signal;
  child.connected = false;
  child.emit("exit", code, signal);
}

vi.mock("node:child_process", () => ({
  fork: (script: string, _args: string[], options: Record<string, unknown>) => {
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      connected: true,
      exitCode: null,
      signalCode: null,
      send: vi.fn(),
      kill: vi.fn(),
    }) as FakeChild;
    /* Like the real worker: asked to stop, it exits — unless a test makes it
       ignore everything but SIGKILL. */
    child.send.mockImplementation((msg: { type: string }) => {
      if (msg.type === "stop" && obedient) queueMicrotask(() => exit(child, 0, null));
    });
    /* A killed process is gone a moment after the signal, not at once. */
    child.kill.mockImplementation((signal: NodeJS.Signals) => {
      if (signal === "SIGKILL" || obedient) setTimeout(() => exit(child, null, signal), 50);
    });
    forks.push({ script, options, child });
    return child;
  },
}));

const { createProcessManager } = await import("../src/server/mock-manager/process-manager");

const STUDIO_TRANSFORMS = "/work/node_modules/.cache/courier/transform";
let transformCacheDirectory: string | null = STUDIO_TRANSFORMS;

function manager() {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn(),
  };
  return { events, pm: createProcessManager(events, { transformCacheDirectory: () => transformCacheDirectory }) };
}

const request = { serverId: "apiMock", mocksFile: "/work/courier.mocks.ts", mockKey: "apiMock", port: 7401 };

afterEach(() => {
  forks.length = 0;
  obedient = true;
  transformCacheDirectory = STUDIO_TRANSFORMS;
  vi.useRealTimers();
});

describe("starting a managed mock", () => {
  it("forks Studio's own worker with no loader flags, in the project, with its output visible", async () => {
    const { pm } = manager();

    pm.spawn({ ...request, mocksFile: "/work/my app/courier.mocks.ts" });

    const [{ script, options }] = forks as [(typeof forks)[number]];
    expect(script).toMatch(/[/\\]lib[/\\]mock-worker\.js$/);
    expect(script).not.toContain("%");
    expect(options.execArgv).toEqual([]);
    expect(options.cwd).toBe("/work/my app");
    expect(options.stdio).toEqual(["ignore", "inherit", "inherit", "ipc"]);
    await pm.dispose();
  });

  it("tells the worker the port Studio chose for it", async () => {
    const { pm } = manager();

    pm.spawn(request);

    expect(forks[0]?.child.send).toHaveBeenCalledWith(
      {
        type: "start",
        mocksFile: "/work/courier.mocks.ts",
        mockKey: "apiMock",
        port: 7401,
        transformCacheDirectory: STUDIO_TRANSFORMS,
      },
      expect.any(Function),
    );
    await pm.dispose();
  });

  it("tells each worker where Studio keeps transforms as it starts, or that it keeps none", async () => {
    const { pm } = manager();

    pm.spawn(request);
    transformCacheDirectory = null;
    pm.spawn({ ...request, serverId: "otherMock", mockKey: "otherMock" });

    const starts = forks.map(({ child }) => child.send.mock.calls[0]?.[0]);
    expect(starts).toEqual([
      expect.objectContaining({ mockKey: "apiMock", transformCacheDirectory: STUDIO_TRANSFORMS }),
      expect.objectContaining({ mockKey: "otherMock", transformCacheDirectory: null }),
    ]);
    await pm.dispose();
  });
});

describe("a managed mock that ends", () => {
  it("is reported when a signal ended it", async () => {
    const { events, pm } = manager();
    pm.spawn(request);

    forks[0]?.child.emit("close", null, "SIGKILL");

    expect(events.onExited).toHaveBeenCalledWith("apiMock", "was stopped by SIGKILL");
    await pm.dispose();
  });

  it("is reported when it exited on its own, even with code 0", async () => {
    const { events, pm } = manager();
    pm.spawn(request);

    forks[0]?.child.emit("close", 0, null);

    expect(events.onExited).toHaveBeenCalledWith("apiMock", "exited with code 0");
    await pm.dispose();
  });

  it("is not reported when Studio stopped it", async () => {
    const { events, pm } = manager();
    pm.spawn(request);
    const child = forks[0]?.child as FakeChild;

    await pm.kill("apiMock");
    child.emit("close", 0, null);

    expect(events.onExited).not.toHaveBeenCalled();
    await pm.dispose();
  });
});

describe("stopping a managed mock", () => {
  it("leaves no timer behind once the worker has exited", async () => {
    vi.useFakeTimers();
    const { pm } = manager();
    pm.spawn(request);

    await pm.kill("apiMock");

    expect(vi.getTimerCount()).toBe(0);
    await pm.dispose();
  });

  it("resolves only once a worker that ignores the stop is gone", async () => {
    vi.useFakeTimers();
    obedient = false;
    const { pm } = manager();
    pm.spawn(request);
    const child = forks[0]?.child as FakeChild;
    let stopped = false;

    const stopping = pm.kill("apiMock").then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(child.kill).toHaveBeenLastCalledWith("SIGTERM");
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await stopping;


    expect(child.signalCode).toBe("SIGKILL");
    await pm.dispose();
  });

  it("keeps the worker that replaced a stopped one when the stopped one closes late", async () => {
    const { events, pm } = manager();
    pm.spawn(request);
    const old = forks[0]?.child as FakeChild;
    await pm.kill("apiMock");

    pm.spawn(request);
    old.emit("close", 0, null);

    expect(pm.has("apiMock")).toBe(true);
    expect(events.onExited).not.toHaveBeenCalled();
    await pm.dispose();
  });

  it("does not throw when the worker's channel has already closed", async () => {
    const { pm } = manager();
    pm.spawn(request);
    const child = forks[0]?.child as FakeChild;
    child.connected = false;

    expect(() => pm.sendCommand("apiMock", { action: "mock:store:list" })).not.toThrow();
    expect(child.send).toHaveBeenCalledTimes(1);
    exit(child, 0, null);
    await pm.dispose();
  });
});

describe("the host process", () => {
  it("keeps its signal handlers, and gets its exit handler back on dispose", async () => {
    const before = ["SIGINT", "SIGTERM", "SIGHUP", "exit"].map((e) => process.listenerCount(e));

    const { pm } = manager();
    const during = ["SIGINT", "SIGTERM", "SIGHUP"].map((e) => process.listenerCount(e));
    await pm.dispose();

    expect(during).toEqual(before.slice(0, 3));
    expect(["SIGINT", "SIGTERM", "SIGHUP", "exit"].map((e) => process.listenerCount(e))).toEqual(before);
  });
});
