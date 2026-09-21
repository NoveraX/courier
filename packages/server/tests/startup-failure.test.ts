/**
 * A library may not decide that the host process should end. A port that is
 * already taken is an outcome the caller handles, not a reason to exit.
 */
import { describe, expect, it, vi } from "vitest";

import { createCourierServer } from "../src/create-server";

const sources = {};

/** Claim a port, so the next server to ask for it cannot have it. */
async function occupiedPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const holder = createCourierServer({ sources, port: 0, signals: false });
  const url = await holder.ready;
  return { port: Number(new URL(url).port), release: () => holder.stop() };
}

describe("a server that cannot start", () => {
  it("rejects `ready` instead of ending the process", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const { port, release } = await occupiedPort();

    const second = createCourierServer({ sources, port, signals: false });
    await expect(second.ready).rejects.toThrow(/already in use/);
    expect(exit).not.toHaveBeenCalled();

    exit.mockRestore();
    await release();
  });

  it("names the port it could not take", async () => {
    const { port, release } = await occupiedPort();

    const second = createCourierServer({ sources, port, signals: false });
    await expect(second.ready).rejects.toThrow(new RegExp(`Port ${port} is already in use`));

    await release();
  });

  it("reports the failure to onServerError as well", async () => {
    const onServerError = vi.fn();
    const { port, release } = await occupiedPort();

    const second = createCourierServer({ sources, port, signals: false, onServerError });
    await expect(second.ready).rejects.toThrow();

    expect(onServerError).toHaveBeenCalledOnce();
    expect(onServerError.mock.calls[0]![0]).toBeInstanceOf(Error);
    await release();
  });

  /** The underlying errno is still reachable for a caller that wants it. */
  it("keeps the original error as the cause", async () => {
    const { port, release } = await occupiedPort();

    const second = createCourierServer({ sources, port, signals: false });

    await expect(second.ready).rejects.toMatchObject({ cause: { code: "EADDRINUSE" } });
    await release();
  });

  /** Nobody awaiting `ready` must not become an unhandled rejection. */
  it("survives a caller that never looks at ready", async () => {
    const { port, release } = await occupiedPort();

    createCourierServer({ sources, port, signals: false });
    await new Promise((resolve) => setTimeout(resolve, 50));

    await release();
  });
});

describe("a server that starts", () => {
  it("resolves ready with its own url", async () => {
    const server = createCourierServer({ sources, port: 0, signals: false });

    const url = await server.ready;

    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(server.url).toBe(url);
    await server.stop();
  });
});
