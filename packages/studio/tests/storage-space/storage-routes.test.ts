import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockStoreFile } from "../../src/server/mock-store-file";
import type { JsonResponse } from "../../src/server/route-types";
import { openStudioStores } from "../../src/server/storage/studio-stores";
import { resetMockStores } from "../../src/server/storage-space/reset-mock-stores";
import { registerStorageRoutes } from "../../src/server/storage-space/storage-routes";
import { WRITING_ROUTES } from "../../src/server/token-guard";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "courier-storage-routes-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

type Handler = (req: { body: unknown }, res: JsonResponse) => void | Promise<void>;

function routes(root: string) {
  const stores = openStudioStores(root);
  cleanups.push(() => stores.close());
  const handlers = new Map<string, Handler>();
  const announce = vi.fn();
  const mocks = { summarizeServers: () => [], forwardStoreCommand: () => undefined };
  registerStorageRoutes(
    { post: (path: string, handler: Handler) => handlers.set(path, handler) },
    {
      stores,
      root,
      mocks,
      announce,
    },
  );
  const call = async (path: string, body: unknown = {}) => {
    let status = 200;
    let sent: unknown;
    const res: JsonResponse = {
      status(code: number) {
        status = code;
        return res;
      },
      json(data: unknown) {
        sent = data;
      },
    };
    await handlers.get(path)?.({ body }, res);
    return { status, sent };
  };
  return { call, announce };
}

describe("the storage routes", () => {
  it("measure what Studio keeps", async () => {
    const { call } = routes(project());

    const { status, sent } = await call("/api/storage");

    expect(status).toBe(200);
    expect(sent).toMatchObject({ folder: ".courier", persistent: true });
  });

  it("clear what a page names, and tell every page", async () => {
    const { call, announce } = routes(project());

    const { status, sent } = await call("/api/storage/clear", { kinds: ["requests", "requests"] });

    expect(status).toBe(200);
    expect(announce).toHaveBeenCalledWith(["requests"]);
    expect(sent).toMatchObject({ kinds: expect.any(Array) });
  });

  it("refuse a clear that names nothing it keeps", async () => {
    const { call, announce } = routes(project());

    const none = await call("/api/storage/clear", { kinds: [] });
    const unknown = await call("/api/storage/clear", { kinds: ["everything"] });

    expect([none.status, unknown.status]).toEqual([400, 400]);
    expect(announce).not.toHaveBeenCalled();
  });

  it("need the token to clear or compact", () => {
    expect(WRITING_ROUTES.has("/api/storage/clear")).toBe(true);
    expect(WRITING_ROUTES.has("/api/storage/compact")).toBe(true);
    expect(WRITING_ROUTES.has("/api/storage")).toBe(false);
  });
});

describe("resetting the mocks' stores", () => {
  it("asks a running mock to reset its own, and deletes the files of the others", async () => {
    const root = project();
    const running = mockStoreFile(root, "shop") ?? "";
    const stopped = mockStoreFile(root, "billing") ?? "";
    const gone = join(root, ".courier", "mocks", "old-0000aaaa.sqlite");
    for (const file of [running, stopped, `${stopped}-wal`, gone]) writeFileSync(file, "x");
    const forwardStoreCommand = vi.fn(async () => ({ ok: true }));

    await resetMockStores(root, {
      summarizeServers: () => [
        { key: "shop", alive: true, port: 7011, portDeclared: true },
        { key: "billing", alive: false, port: 7012, portDeclared: true },
      ],
      forwardStoreCommand,
    });

    expect(forwardStoreCommand).toHaveBeenCalledWith({
      action: "mock:server:reset",
      serverId: "shop",
    });
    expect([running, stopped, `${stopped}-wal`, gone].map(existsSync)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("does nothing where no mock ever kept a store", async () => {
    const root = project();
    mkdirSync(join(root, ".courier"));

    await expect(
      resetMockStores(root, { summarizeServers: () => [], forwardStoreCommand: () => undefined }),
    ).resolves.toBeUndefined();
  });
});
