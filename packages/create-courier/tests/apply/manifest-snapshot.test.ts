import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { snapshotManifests } from "../../src/apply/manifest-snapshot";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

describe("snapshotManifests", () => {
  it("puts package.json and the lockfile back as they were, removes a lockfile the install wrote, and leaves the rest", () => {
    const root = projectWith({ "package.json": '{ "name": "app" }\n', "yarn.lock": "# yarn\n" });
    const snapshot = snapshotManifests(root);

    writeFileSync(join(root, "package.json"), '{ "name": "app", "dependencies": {} }\n');
    writeFileSync(join(root, "package-lock.json"), "{}\n");

    expect(snapshot.restore()).toEqual({
      removed: ["package-lock.json"],
      putBack: ["package.json"],
      kept: [],
    });
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe('{ "name": "app" }\n');
    expect(existsSync(join(root, "package-lock.json"))).toBe(false);
    expect(readFileSync(join(root, "yarn.lock"), "utf8")).toBe("# yarn\n");
  });

  it("puts a file back once the install has run only while it holds what the install left, and keeps one changed since", () => {
    const root = projectWith({
      "package.json": '{ "name": "app" }\n',
      "package-lock.json": "{}\n",
    });
    const snapshot = snapshotManifests(root);
    const theirs = '{ "name": "app", "scripts": { "dev": "vite" } }\n';

    writeFileSync(join(root, "package.json"), '{ "name": "app", "dependencies": {} }\n');
    writeFileSync(join(root, "package-lock.json"), '{ "lockfileVersion": 3 }\n');
    snapshot.installed();
    writeFileSync(join(root, "package.json"), theirs);

    expect(snapshot.restore()).toEqual({
      removed: [],
      putBack: ["package-lock.json"],
      kept: [
        {
          path: "package.json",
          why: "it changed after the install wrote it, so it was left as it is",
        },
      ],
    });
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(theirs);
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe("{}\n");
  });

  it("notes the workspace's lockfile, which an install in one of its packages writes", () => {
    const root = projectWith({
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "apps/web/package.json": '{ "name": "web" }\n',
    });
    const snapshot = snapshotManifests(join(root, "apps/web"));

    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages: {}\n");

    expect(snapshot.restore().putBack).toEqual(["../../pnpm-lock.yaml"]);
    expect(readFileSync(join(root, "pnpm-lock.yaml"), "utf8")).toBe("lockfileVersion: '9.0'\n");
  });
});
