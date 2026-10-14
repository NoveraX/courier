/**
 * Studio reads a project's variables before its config, as the application's
 * development server does, so a source whose address comes from
 * `process.env` has the same address in Studio — its graph, its mocks, its
 * documents — as in the application: from `.env.development.local`,
 * `.env.local`, `.env.development` and `.env`, the first to set a variable
 * winning and the process's own environment over all, or from the files
 * `--dotenv` names.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadCourierConfig } from "../src/server/config-loader";
import { createProjectEnv, loadProjectEnv } from "../src/server/project-env";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const NAMES = [
  "COURIER_TEST_API_URL",
  "COURIER_TEST_REGION",
  "COURIER_TEST_TOKEN",
  "COURIER_TEST_TIER",
];

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-project-env-")));
});

afterEach(() => {
  for (const name of NAMES) Reflect.deleteProperty(process.env, name);
  rmSync(root, { recursive: true, force: true });
});

function write(file: string, lines: string[]): void {
  writeFileSync(join(root, file), `${lines.join("\n")}\n`);
}

describe("loadProjectEnv", () => {
  it("reads the development files there are, the first to set a variable winning", () => {
    write(".env", [
      "COURIER_TEST_API_URL=https://env.example",
      "COURIER_TEST_REGION=env",
      "COURIER_TEST_TIER=env",
    ]);
    write(".env.local", [
      "COURIER_TEST_API_URL=https://local.example",
      "COURIER_TEST_REGION=local",
    ]);
    write(".env.development.local", ["COURIER_TEST_API_URL=https://dev-local.example"]);

    const loaded = loadProjectEnv(root);

    expect(loaded).toEqual([".env.development.local", ".env.local", ".env"]);
    expect(process.env.COURIER_TEST_API_URL).toBe("https://dev-local.example");
    expect(process.env.COURIER_TEST_REGION).toBe("local");
    expect(process.env.COURIER_TEST_TIER).toBe("env");
  });

  it("leaves a variable the process was started with as it is", () => {
    process.env.COURIER_TEST_TOKEN = "from-the-shell";
    write(".env", ["COURIER_TEST_TOKEN=from-the-file"]);

    loadProjectEnv(root);

    expect(process.env.COURIER_TEST_TOKEN).toBe("from-the-shell");
  });

  it("reads only the files --dotenv names, in their order", () => {
    write(".env", ["COURIER_TEST_REGION=env"]);
    write(".env.staging", ["COURIER_TEST_REGION=staging"]);
    write(".env.shared", ["COURIER_TEST_REGION=shared", "COURIER_TEST_TIER=shared"]);

    const loaded = loadProjectEnv(root, ".env.staging, .env.shared");

    expect(loaded).toEqual([".env.staging", ".env.shared"]);
    expect(process.env.COURIER_TEST_REGION).toBe("staging");
    expect(process.env.COURIER_TEST_TIER).toBe("shared");
  });

  it("names a file --dotenv names that is not there", () => {
    expect(() => loadProjectEnv(root, ".env.missing")).toThrow(
      `--dotenv .env.missing: there is no file at ${join(root, ".env.missing")}`,
    );
  });

  it("reads nothing in a project without the files", () => {
    expect(loadProjectEnv(root)).toEqual([]);
  });
});

describe("a config whose address comes from the project's variables", () => {
  it("gives the source the address the application has", async () => {
    symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
    write(".env.local", ["COURIER_TEST_API_URL=https://api.example.com/v2"]);
    write("courier.config.ts", [
      'import { defineApi } from "@noverax/courier/define";',
      "export default {",
      "  sources: {",
      '    shop: defineApi({ name: "shop", baseURL: process.env.COURIER_TEST_API_URL + "/shop", endpoints: {} }),',
      "  },",
      "};",
    ]);

    loadProjectEnv(root);
    const { config } = await loadCourierConfig(root);

    expect(config.sources.shop?.options?.baseURL).toBe("https://api.example.com/v2/shop");
  });
});

describe("the variables read again when their files change", () => {
  it("take the value their file gives now, and only those that changed are named", () => {
    write(".env.local", ["COURIER_TEST_API_URL=https://a.example.com", "COURIER_TEST_REGION=eu"]);
    const env = createProjectEnv(root);
    write(".env.local", [
      "# moved to the new host",
      "COURIER_TEST_API_URL=https://b.example.com",
      "COURIER_TEST_REGION=eu",
    ]);

    expect(env.reread()).toEqual(["COURIER_TEST_API_URL"]);
    expect(process.env.COURIER_TEST_API_URL).toBe("https://b.example.com");
  });

  it("are gone once their files no longer give them", () => {
    write(".env", ["COURIER_TEST_TOKEN=t1"]);
    const env = createProjectEnv(root);
    write(".env", ["# no token here"]);

    expect(env.reread()).toEqual(["COURIER_TEST_TOKEN"]);
    expect(process.env.COURIER_TEST_TOKEN).toBeUndefined();
  });

  it("come from a file made after Studio started, ahead of the files read first", () => {
    write(".env", ["COURIER_TEST_API_URL=https://from-env.example.com"]);
    const env = createProjectEnv(root);
    write(".env.local", ["COURIER_TEST_API_URL=https://from-local.example.com"]);

    expect(env.reread()).toEqual(["COURIER_TEST_API_URL"]);
    expect(env.loaded).toEqual([".env.local", ".env"]);
    expect(process.env.COURIER_TEST_API_URL).toBe("https://from-local.example.com");
  });

  it("never change one the process was started with", () => {
    process.env.COURIER_TEST_TIER = "from-the-shell";
    write(".env", ["COURIER_TEST_TIER=from-the-file"]);
    const env = createProjectEnv(root);
    write(".env", ["COURIER_TEST_TIER=changed"]);

    expect(env.reread()).toEqual([]);
    expect(process.env.COURIER_TEST_TIER).toBe("from-the-shell");
  });

  it("leave one something else has given another value since", () => {
    write(".env", ["COURIER_TEST_REGION=eu"]);
    const env = createProjectEnv(root);
    process.env.COURIER_TEST_REGION = "set-by-the-app";
    write(".env", ["# no region here"]);

    env.reread();

    expect(process.env.COURIER_TEST_REGION).toBe("set-by-the-app");
  });
});
