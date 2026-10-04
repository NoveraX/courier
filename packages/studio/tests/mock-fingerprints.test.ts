/**
 * Each mock's fingerprint changes with its own declaration and what that
 * uses, and stays when only another mock's does — so adding a mock, as the
 * wizard does, no longer restarts the mocks already running.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fingerprintMocks } from "../src/server/mock-fingerprints";

let root: string;
let file: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-fingerprints-"));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src/api.ts"),
    'import { base } from "./base";\nexport const api = { base };\n',
  );
  writeFileSync(join(root, "src/base.ts"), 'export const base = "https://api.example";\n');
  writeFileSync(join(root, "src/pets.ts"), "export const pets = {};\nexport const extra = 1;\n");
  file = join(root, "courier.mocks.ts");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const HEAD = [
  'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
  'import { api } from "./src/api";',
].join("\n");

function mocksText(...lines: string[]): string {
  return lines.join("\n");
}

const USERS = "  users: defineMockServer({ source: api, seed: { count: 3 } }),";

function fingerprints(text: string): ReadonlyMap<string, string> {
  const found = fingerprintMocks(file, text);
  if (found === null) throw new Error("expected fingerprints");
  return found;
}

describe("a mock's fingerprint", () => {
  it("stays when another mock is added, with an import of its own", () => {
    const before = fingerprints(mocksText(HEAD, "export default defineMocks({", USERS, "});"));
    const after = fingerprints(
      mocksText(
        HEAD,
        'import { pets } from "./src/pets";',
        "export default defineMocks({",
        USERS,
        "  pets: defineMockServer({ source: pets }),",
        "});",
      ),
    );

    expect(after.get("users")).toBe(before.get("users"));
    expect(after.has("pets")).toBe(true);
  });

  it("stays when an import it uses gains a binding it does not use", () => {
    const users = "  users: defineMockServer({ source: pets }),";
    const before = fingerprints(
      mocksText(
        HEAD,
        'import { pets } from "./src/pets";',
        "export default defineMocks({",
        users,
        "});",
      ),
    );
    const after = fingerprints(
      mocksText(
        HEAD,
        'import { extra, pets } from "./src/pets";',
        "export default defineMocks({",
        users,
        "});",
      ),
    );

    expect(after.get("users")).toBe(before.get("users"));
  });

  it("changes with its own declaration, and only its own", () => {
    const pets = "  pets: defineMockServer({ source: api }),";
    const before = fingerprints(
      mocksText(HEAD, "export default defineMocks({", USERS, pets, "});"),
    );
    const after = fingerprints(
      mocksText(
        HEAD,
        "export default defineMocks({",
        "  users: defineMockServer({ source: api, seed: { count: 9 } }),",
        pets,
        "});",
      ),
    );

    expect(after.get("users")).not.toBe(before.get("users"));
    expect(after.get("pets")).toBe(before.get("pets"));
  });

  it("changes when a module its import reaches changes, however deep", () => {
    const text = mocksText(
      HEAD,
      'import { pets } from "./src/pets";',
      "export default defineMocks({",
      USERS,
      "  pets: defineMockServer({ source: pets }),",
      "});",
    );
    const before = fingerprints(text);
    writeFileSync(join(root, "src/base.ts"), 'export const base = "https://staging.example";\n');
    const after = fingerprints(text);

    expect(after.get("users")).not.toBe(before.get("users"));
    expect(after.get("pets")).toBe(before.get("pets"));
  });

  it("stays when a directory is made beside a module its import reaches", () => {
    const text = mocksText(HEAD, "export default defineMocks({", USERS, "});");
    const before = fingerprints(text);
    mkdirSync(join(root, "src/api"));
    writeFileSync(join(root, "src/api/index.ts"), "export const pets = {};\n");
    mkdirSync(join(root, "src/base"));

    expect(fingerprints(text).get("users")).toBe(before.get("users"));
  });

  it("changes when a module is made where the loader now takes it", () => {
    const text = mocksText(HEAD, "export default defineMocks({", USERS, "});");
    const before = fingerprints(text);
    writeFileSync(join(root, "src/api.js"), "export const api = {};\n");

    expect(fingerprints(text).get("users")).not.toBe(before.get("users"));
  });

  it("follows a declaration beside it that it uses", () => {
    const text = (count: number) =>
      mocksText(
        HEAD,
        `const seed = { count: ${count} };`,
        "export default defineMocks({",
        "  users: defineMockServer({ source: api, seed }),",
        "  pets: defineMockServer({ source: api }),",
        "});",
      );
    const before = fingerprints(text(3));
    const after = fingerprints(text(4));

    expect(after.get("users")).not.toBe(before.get("users"));
    expect(after.get("pets")).toBe(before.get("pets"));
  });

  it("changes for every mock when a statement that declares nothing changes", () => {
    const text = (arg: number) =>
      mocksText(HEAD, `console.log(${arg});`, "export default defineMocks({", USERS, "});");

    expect(fingerprints(text(2)).get("users")).not.toBe(fingerprints(text(1)).get("users"));
  });

  it("follows mocks held by a const that is exported", () => {
    const text = (count: number) =>
      mocksText(
        HEAD,
        `const mocks = defineMocks({ users: defineMockServer({ source: api, seed: { count: ${count} } }) });`,
        "export default mocks;",
      );

    expect(fingerprints(text(2)).get("users")).not.toBe(fingerprints(text(1)).get("users"));
  });

  it("is not given when the mocks' keys cannot all be read", () => {
    const text = mocksText(
      HEAD,
      "const more = {};",
      "export default defineMocks({ ...more, ",
      USERS,
      "});",
    );

    expect(fingerprintMocks(file, text)).toBeNull();
  });
});
