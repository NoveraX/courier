/**
 * The wizard names the running mocks an edit restarts: those whose
 * declaration, or what it uses, the edit changes — none when it only adds a
 * mock, not every running mock.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { restartedByEdit } from "../src/server/mock-fingerprints";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-restarts-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/api.ts"), "export const api = {};\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BEFORE = [
  'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
  'import { api } from "./src/api";',
  "export default defineMocks({",
  "  users: defineMockServer({ source: api }),",
  "  orders: defineMockServer({ source: api, port: 7002 }),",
  "});",
].join("\n");

describe("restartedByEdit", () => {
  it("names no running mock for an edit that only adds one", () => {
    const after = BEFORE.replace("});", "  pets: defineMockServer({ source: api }),\n});");

    expect(
      restartedByEdit({
        file: join(root, "courier.mocks.ts"),
        before: BEFORE,
        after,
        running: ["users", "orders"],
      }),
    ).toEqual([]);
  });

  it("names the running mocks whose declaration the edit changes", () => {
    const after = BEFORE.replace("port: 7002", "port: 7003");

    expect(
      restartedByEdit({
        file: join(root, "courier.mocks.ts"),
        before: BEFORE,
        after,
        running: ["users", "orders"],
      }),
    ).toEqual(["orders"]);
  });

  it("names every running mock when it cannot tell the declarations apart", () => {
    const after = BEFORE.replace(
      "export default defineMocks({",
      "const more = {};\nexport default defineMocks({ ...more,",
    );

    expect(
      restartedByEdit({
        file: join(root, "courier.mocks.ts"),
        before: BEFORE,
        after,
        running: ["users", "orders"],
      }),
    ).toEqual(["users", "orders"]);
  });
});
