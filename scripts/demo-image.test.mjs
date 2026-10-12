/**
 * The demo's image installs Courier's packages from tarballs it packs, as
 * npm will publish them: a Courier package one of them needs and the image
 * does not pack is looked up on the registry, and the image cannot be
 * built. Each list in its Dockerfile is held to what the demo's packages
 * need.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dependencyGraph, packageDirs, readPkg, SCOPE } from "./release-order.ts";

const dockerfile = readFileSync("examples/demo-shop/Dockerfile", "utf8");

/* The names a `for pkg in …` loop of the Dockerfile goes over, in order. */
function loops() {
  return [...dockerfile.matchAll(/for pkg in ([^;]+);/g)].map((match) =>
    match[1].trim().split(/\s+/),
  );
}

/* Every Courier package the demo depends on, and every one those need. */
function needed() {
  const demo = readPkg("examples/demo-shop");
  const graph = dependencyGraph(packageDirs());
  const wanted = Object.keys(demo.dependencies ?? {}).filter((name) => name.startsWith(SCOPE));
  const seen = new Set();
  while (wanted.length > 0) {
    const name = wanted.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    wanted.push(...(graph.get(name) ?? []));
  }
  return [...seen].sort();
}

const dirOf = new Map(
  packageDirs().map((dir) => [readPkg(dir).name, dir.replace("packages/", "")]),
);

describe("the demo's image", () => {
  it("packs every Courier package the demo's packages need", () => {
    const [packed] = loops();

    expect([...packed].sort()).toEqual(
      needed()
        .map((name) => dirOf.get(name))
        .sort(),
    );
  });

  it("installs each of them from its tarball", () => {
    const [, installed] = loops();

    expect(installed.map((name) => `@noverax/${name}`).sort()).toEqual(needed());
  });
});
