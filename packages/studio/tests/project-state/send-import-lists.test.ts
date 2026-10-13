/**
 * Every page is told why an import's last update check failed, and that
 * can name a path of this machine: a page with the project's token is told
 * it as it is, any other with the project's paths relative to it and the
 * rest of the home directory from `~` — one page at a time as it connects,
 * or every page at once by the room each is in.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { READ_ONLY_PAGES, TOKEN_PAGES } from "../../src/server/live-events";
import { sendImportLists } from "../../src/server/project-state/send-import-lists";
import type { ProjectSnapshot } from "../../src/server/project-state/types";
import { createUpdateChecks, type UpdateChecks } from "../../src/server/update-checks";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-import-lists-")));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const FROM = "https://specs.example/billing.json";

function snapshot(): ProjectSnapshot {
  const config: CourierConfig = {
    sources: {},
    imports: { billing: { importType: "url", type: "openapi", from: FROM, outputDir: "src/api" } },
  };
  const running: LoadedCourierConfig = {
    config,
    configFile: join(root, "courier.config.ts"),
    contentHash: null,
    deps: [],
    depHashes: new Map(),
    evaluated: new Map<string, string>(),
    mocks: { file: null, entries: {}, contentHash: null, error: null },
  };
  return { revision: 1, starting: false, running, loadedAt: 1_000, failure: null };
}

function checksFailing(error: string): UpdateChecks {
  const checks = createUpdateChecks();
  checks.record("billing", { from: FROM, checkedAt: 2_000, error });
  return checks;
}

/* What each page was sent, by the room it is in. */
function pages() {
  const sent: Array<{ room: string; event: string; payload: unknown }> = [];
  const emitTo = (room: string) => ({
    emit: (event: string, payload: unknown) => sent.push({ room, event, payload }),
  });
  return { sent, namespace: { ...emitTo("every page"), to: emitTo } };
}

function socketIn(room: string) {
  const sent: Array<[string, unknown]> = [];
  return {
    sent,
    socket: {
      rooms: new Set([room]),
      emit: (event: string, payload: unknown) => sent.push([event, payload]),
      to: () => {
        throw new Error("A socket's `to` sends to the other pages.");
      },
    },
  };
}

function checkErrorOf(payload: unknown): unknown {
  const { sources } = payload as { sources: Array<{ check?: { error?: string } }> };
  return sources[0]?.check?.error;
}

describe("sendImportLists", () => {
  it("tells the pages without the token no path of this machine in a check's failure", () => {
    const error = `courier.config does not load right now (Cannot find module '${root}/src/env.ts' imported from '${homedir()}/.npm/x.js')`;
    const { sent, namespace } = pages();

    sendImportLists(namespace, snapshot(), root, checksFailing(error));

    const lists = sent.filter((packet) => packet.event === "registry:updated");
    expect(lists.map((packet) => packet.room)).toEqual([TOKEN_PAGES, READ_ONLY_PAGES]);
    expect(checkErrorOf(lists[0]?.payload)).toBe(error);
    expect(checkErrorOf(lists[1]?.payload)).toBe(
      "courier.config does not load right now (Cannot find module 'src/env.ts' imported from '~/.npm/x.js')",
    );
  });

  it("tells a page that connects as its token says", () => {
    const error = `It failed in ${root}/specs.`;
    const withToken = socketIn(TOKEN_PAGES);
    const without = socketIn(READ_ONLY_PAGES);

    sendImportLists(withToken.socket, snapshot(), root, checksFailing(error));
    sendImportLists(without.socket, snapshot(), root, checksFailing(error));

    expect(checkErrorOf(withToken.sent[0]?.[1])).toBe(error);
    expect(checkErrorOf(without.sent[0]?.[1])).toBe("It failed in specs.");
  });

  it("sends every page one list when no check names a path", () => {
    const { sent, namespace } = pages();

    sendImportLists(namespace, snapshot(), root, checksFailing(`${FROM} answered 500.`));

    expect(sent.filter((packet) => packet.event === "registry:updated")).toEqual([
      expect.objectContaining({ room: "every page" }),
    ]);
  });

  it("sends the list, then the sources, as before", () => {
    const { sent, namespace } = pages();

    sendImportLists(namespace, snapshot(), root, checksFailing(`Failed in ${root}.`));

    expect(sent.map((packet) => packet.event)).toEqual([
      "registry:updated",
      "registry:updated",
      "scan:sources",
    ]);
  });
});
