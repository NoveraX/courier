/**
 * The slots' contract and the version in the registry's key change
 * together. A copy of the core under the same key calls another copy's
 * implementation with the arguments of its own types, so the shape of
 * every slot — its interface, and each type of the core it names, however
 * deep, a line for each member — is recorded under the key's version, in a
 * file of the key's name beside this test. A shape that differs fails here
 * with the lines that changed. Until a release carries a version, a new one
 * is needed only where another copy reads what changed; once one does, a
 * copy of that release calls the slots as its shape says, so the shape is
 * held to its digest here, and any change moves the key's version on.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { slotShape } from "../helpers/slot-shape";

const REGISTRY = fileURLToPath(new URL("../../src/capabilities/registry.ts", import.meta.url));
const SOURCE = fileURLToPath(new URL("../../src/", import.meta.url));
const HERE = fileURLToPath(new URL(".", import.meta.url));

/* The versions a release carries, each with the release and the digest of its recorded shape. */
const RELEASED = new Map([
  [
    "courier.serverCapabilities.v1",
    {
      release: "0.5.0",
      digest: "13a68b358f6459e96324006eb093ede073b953fcfa6029a9e205a35c32031ddf",
    },
  ],
]);

function keyOfRegistry(): string | undefined {
  return /Symbol\.for\("(courier\.serverCapabilities\.[^"]+)"\)/.exec(
    readFileSync(REGISTRY, "utf8"),
  )?.[1];
}

/* The recorded shapes, by the key they were recorded under. */
function recordedShapes(): Map<string, string[]> {
  const files = readdirSync(HERE).filter((file) =>
    /^courier\.serverCapabilities\..+\.txt$/.test(file),
  );
  return new Map(
    files.map((file) => [
      file.slice(0, -".txt".length),
      readFileSync(join(HERE, file), "utf8").trimEnd().split("\n"),
    ]),
  );
}

function changedMessage(key: string): string {
  const release = RELEASED.get(key)?.release;
  if (release !== undefined) {
    return [
      `the shape of the slots under ${key} changed in these lines.`,
      `${release} carries that key, and a copy of it calls these slots with the shape it was released with:`,
      "move the key's version on in capabilities/registry.ts and record the shape under the new one",
    ].join(" ");
  }
  return [
    `the shape of the slots under ${key} changed in these lines.`,
    "Another copy of the core under the same key calls these slots with its own types:",
    "where a copy reads what changed — a member it calls, an argument it passes, a field it reads —",
    `move the key's version on in capabilities/registry.ts and record the shape under the new one;`,
    `where none does, write the lines into tests/capabilities/${key}.txt`,
  ].join(" ");
}

describe("the contract of the server's slots", () => {
  it("writes out each type a slot reaches", () => {
    expect(slotShape(REGISTRY, SOURCE).refused).toEqual([]);
  });

  it("keeps the shape its key's version was recorded with", () => {
    const key = keyOfRegistry() ?? "";
    const recorded = recordedShapes().get(key);
    const { lines } = slotShape(REGISTRY, SOURCE);

    expect(
      recorded,
      `no shape is recorded for ${key}: write its lines into tests/capabilities/${key}.txt`,
    ).toBeDefined();
    const changed = [
      ...(recorded ?? []).filter((line) => !lines.includes(line)).map((line) => `- ${line}`),
      ...lines.filter((line) => !(recorded ?? []).includes(line)).map((line) => `+ ${line}`),
    ];
    expect(changed, changedMessage(key)).toEqual([]);
  });

  it("reads the same shape where the source's folder is named with backslashes, as on Windows", () => {
    const key = keyOfRegistry() ?? "";

    expect(slotShape(REGISTRY, SOURCE.replaceAll("/", "\\")).lines).toEqual(
      recordedShapes().get(key),
    );
  });

  it("holds each released version's shape as its release carries it", () => {
    const recorded = recordedShapes();
    for (const [key, { release, digest }] of RELEASED) {
      const lines = recorded.get(key);
      expect(lines, `${release} carries ${key}: keep tests/capabilities/${key}.txt`).toBeDefined();
      expect(
        createHash("sha256")
          .update((lines ?? []).join("\n"))
          .digest("hex"),
        `tests/capabilities/${key}.txt holds the shape ${release} was released with: leave it as it is, and record a changed shape under a new version`,
      ).toBe(digest);
    }
  });

  it("records a shape of its own for each version", () => {
    const shapes = [...recordedShapes().values()].map((lines) => lines.join("\n"));

    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
