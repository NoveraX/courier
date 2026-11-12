/**
 * What a UI is sent of the project, and in what order: the imports list and
 * the source catalogue first, the status last; only the status while Studio
 * starts; the status even when the lists cannot be built; and a failed
 * config's text cut for a page without the token.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import type { AnySource } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { failureOf } from "../../src/server/project-state/failure-of";
import { sendProject } from "../../src/server/project-state/send-project";
import type { ProjectSnapshot } from "../../src/server/project-state/types";
import { createUpdateChecks } from "../../src/server/update-checks";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-send-project-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function loadedWith(config: CourierConfig): LoadedCourierConfig {
  return {
    config,
    configFile: join(root, "courier.config.ts"),
    contentHash: null,
    deps: [],
    depHashes: new Map(),
    evaluated: new Map<string, string>(),
    mocks: { file: null, entries: {}, contentHash: null, error: null },
  };
}

function snapshotOf(running: LoadedCourierConfig): ProjectSnapshot {
  return { revision: 1, starting: false, running, loadedAt: 1_000, failure: null };
}

/* Pages in the two rooms a status goes to, and what each room was sent. */
function pagesByRoom() {
  const rooms = new Map<string, unknown[]>();
  const pages = {
    emit: vi.fn(),
    to: (room: string) => ({
      emit: (_event: string, payload: unknown) =>
        rooms.set(room, [...(rooms.get(room) ?? []), payload]),
    }),
  };
  return { rooms, pages };
}

function recorder() {
  const sent: Array<[string, unknown]> = [];
  return {
    sent,
    target: { emit: (event: string, payload: unknown) => sent.push([event, payload]) },
  };
}

describe("sendProject", () => {
  it("sends the imports list and the sources, then the status", () => {
    const { sent, target } = recorder();
    const config: CourierConfig = {
      sources: {},
      imports: {
        remote: {
          importType: "url",
          type: "openapi",
          from: "https://specs.example/a.json",
          outputDir: "src/gen",
        },
      },
    };

    sendProject(target, snapshotOf(loadedWith(config)), root, createUpdateChecks());

    expect(sent.map(([event]) => event)).toEqual([
      "registry:updated",
      "scan:sources",
      "config:status",
    ]);
    expect(sent[0]?.[1]).toMatchObject({
      sources: [{ name: "remote", specUrl: "https://specs.example/a.json" }],
    });
    expect(sent[2]?.[1]).toMatchObject({ state: "loaded", configFile: "courier.config.ts" });
  });

  it("sends only the status while Studio starts", () => {
    const { sent, target } = recorder();

    sendProject(
      target,
      { revision: 0, starting: true, running: null, loadedAt: null, failure: null },
      root,
      createUpdateChecks(),
    );

    expect(sent).toEqual([["config:status", { state: "starting", revision: 0 }]]);
  });

  it("tells a config that failed whole to the pages with the token, and cut to the others", () => {
    /* Unset as a CI runner may set it: its value stands in the address below. */
    vi.stubEnv("PGUSER", undefined);
    const rooms = new Map<string, unknown[]>();
    const pages = {
      emit: vi.fn(),
      to: (room: string) => ({
        emit: (_event: string, payload: unknown) =>
          rooms.set(room, [...(rooms.get(room) ?? []), payload]),
      }),
    };
    const failure = {
      code: "UNKNOWN" as const,
      message: "courier.config.ts threw: cannot reach postgres://app:hunter2@db.internal/app",
      at: 2_000,
      cause: new Error("cannot reach the database"),
    };

    sendProject(
      pages,
      { revision: 2, starting: true, running: null, loadedAt: null, failure },
      root,
      createUpdateChecks(),
    );

    expect(rooms.get("pages:token")).toEqual([
      expect.objectContaining({ error: { code: "UNKNOWN", message: failure.message } }),
    ]);
    expect(rooms.get("pages:read-only")).toEqual([
      expect.objectContaining({
        error: {
          code: "UNKNOWN",
          message: "courier.config.ts threw: cannot reach postgres://db.internal/app",
        },
      }),
    ]);
    expect(pages.emit).not.toHaveBeenCalled();
  });

  it("cuts the credential for a page without the token where a variable's value stands in it", () => {
    /* As GitHub's Windows runner sets it. */
    vi.stubEnv("PGUSER", "postgres");
    const { rooms, pages } = pagesByRoom();
    const failure = {
      code: "UNKNOWN" as const,
      message: "courier.config.ts threw: cannot reach postgres://app:hunter2@db.internal/app",
      at: 2_000,
      cause: new Error("cannot reach the database"),
    };

    sendProject(
      pages,
      { revision: 2, starting: true, running: null, loadedAt: null, failure },
      root,
      createUpdateChecks(),
    );

    expect(rooms.get("pages:read-only")).toEqual([
      expect.objectContaining({
        error: {
          code: "UNKNOWN",
          message: "courier.config.ts threw: cannot reach [redacted]://db.internal/app",
        },
      }),
    ]);
  });

  it("masks the values of the environment in a failed config's text, for every page", () => {
    vi.stubEnv("PROBE_API_KEY", "FAKE-0000-PROBE-SECRET");
    const { rooms, pages } = pagesByRoom();
    const failure = failureOf(
      new Error("cannot reach db.invalid with key FAKE-0000-PROBE-SECRET"),
      root,
    );

    sendProject(
      pages,
      { revision: 2, starting: true, running: null, loadedAt: null, failure },
      root,
      createUpdateChecks(),
    );

    for (const room of ["pages:token", "pages:read-only"]) {
      expect(JSON.stringify(rooms.get(room))).toContain(
        "cannot reach db.invalid with key [redacted]",
      );
      expect(JSON.stringify(rooms.get(room))).not.toContain("FAKE-0000-PROBE-SECRET");
    }
  });

  it("masks the values of the environment for a page without the token, whatever wrote the text", () => {
    vi.stubEnv("PROBE_API_KEY", "FAKE-0000-PROBE-SECRET");
    const { rooms, pages } = pagesByRoom();
    const failure = {
      code: "UNKNOWN" as const,
      message: "courier.config.ts threw: key FAKE-0000-PROBE-SECRET refused",
      at: 2_000,
      cause: new Error("refused"),
    };

    sendProject(
      pages,
      { revision: 2, starting: true, running: null, loadedAt: null, failure },
      root,
      createUpdateChecks(),
    );

    expect(rooms.get("pages:read-only")).toEqual([
      expect.objectContaining({
        error: { code: "UNKNOWN", message: "courier.config.ts threw: key [redacted] refused" },
      }),
    ]);
  });

  it("still sends the status when the lists cannot be built, and says why", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sent, target } = recorder();
    const unreadable: CourierConfig = {
      get sources(): Record<string, AnySource> {
        throw new Error("the sources could not be read");
      },
    };

    sendProject(target, snapshotOf(loadedWith(unreadable)), root, createUpdateChecks());

    expect(sent.map(([event]) => event)).toEqual(["config:status"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toContain(
      "Studio could not send the imports and sources to the UI",
    );
  });
});
