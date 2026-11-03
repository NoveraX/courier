/**
 * @vitest-environment node
 *
 * The version of Next.js an app builds with, read from the `next` it
 * resolves: what decides how its config names Turbopack's rules.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { nextVersion } from "../src/next-version";
import { type RoutesApp, routesApp } from "./fixtures/routes-app";

let app: RoutesApp | undefined;

afterEach(() => {
  app?.remove();
  app = undefined;
});

describe("nextVersion", () => {
  it("reads the major and minor version of the next the app resolves", () => {
    app = routesApp("15.2.4");

    expect(nextVersion(app.root)).toEqual({ major: 15, minor: 2 });
  });

  it("takes the newest naming when the app resolves no next", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-next-none-")));
    try {
      expect(nextVersion(root)).toEqual({ major: 16, minor: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
