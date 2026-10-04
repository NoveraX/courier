/**
 * A store file: read back as the collections written to it, absent read as
 * nothing yet, refused with a reason when it is not one, and replaced whole
 * so a reader never finds half of it.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readStoreFile,
  StoreFileError,
  storeFileText,
  writeStoreText,
} from "../../src/store/store-file";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-store-file-"));
  dirs.push(dir);
  return dir;
}

describe("a store file", () => {
  it("is read back as the collections written to it", async () => {
    const file = join(folder(), "mocks", "users.json");
    const collections = { users: [{ id: 1, name: "Ada" }], posts: [] };

    await writeStoreText(file, storeFileText(collections));

    expect(readStoreFile(file)).toEqual(collections);
  });

  it("is read as nothing yet when it is not there", () => {
    expect(readStoreFile(join(folder(), "none.json"))).toBeNull();
  });

  it("is written as indented JSON with its format's version", () => {
    expect(storeFileText({ users: [] })).toBe(
      '{\n  "version": 1,\n  "collections": {\n    "users": []\n  }\n}\n',
    );
  });

  it.each([
    ["not JSON", "{ users", /is not a store file Courier can read: /],
    ["of another version", '{ "version": 2, "collections": {} }', /no "version": 1/],
    ["without collections", '{ "version": 1 }', /"collections" is not an object/],
    [
      "with a collection that is not a list of records",
      '{ "version": 1, "collections": { "users": [1] } }',
      /"collections.users" is not a list of records/,
    ],
  ])("is refused with the reason when it is %s", (_, text, reason) => {
    const file = join(folder(), "store.json");
    writeFileSync(file, text);

    expect(() => readStoreFile(file)).toThrow(StoreFileError);
    expect(() => readStoreFile(file)).toThrow(reason);
  });

  it("is replaced whole, leaving nothing beside it", async () => {
    const dir = folder();
    const file = join(dir, "users.json");
    await writeStoreText(file, storeFileText({ users: [{ id: 1 }] }));

    await writeStoreText(file, storeFileText({ users: [{ id: 2 }] }));

    expect(readStoreFile(file)).toEqual({ users: [{ id: 2 }] });
    expect(readdirSync(dir)).toEqual(["users.json"]);
    expect(existsSync(`${file}.${process.pid}.tmp`)).toBe(false);
  });
});
