import { afterAll, describe, expect, it } from "vitest";

import { detectFramework, detectFrameworks } from "../src/frameworks";
import { readProject } from "../src/project/read-project";
import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function listing(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
) {
  return readProject(
    projectWith({
      "package.json": manifest(dependencies, { devDependencies }),
      "tsconfig.json": "{}",
    }),
  );
}

const ids = (project: ReturnType<typeof listing>) => detectFrameworks(project).map(({ id }) => id);

describe("detectFrameworks", () => {
  it("tells the framework a page is built with, and each server framework beside it", () => {
    expect(ids(listing({ express: "^5.1.0", react: "19.2.0", vite: "^7.1.0" }))).toEqual([
      "react",
      "express",
    ]);
    expect(ids(listing({ fastify: "^5.0.0", vue: "^3.5.0" }, { vite: "^7.1.0" }))).toEqual([
      "vue",
      "fastify",
    ]);
    expect(ids(listing({ hono: "^4.9.0", react: "19.2.0" }, { vite: "^7.1.0" }))).toEqual([
      "react",
      "hono",
    ]);
    expect(ids(listing({ next: "16.4.0", react: "19.2.0", express: "^5.1.0" }))).toEqual([
      "next",
      "express",
    ]);
  });

  it("tells one framework for a page, the one built on the others, and none from Hono among the tools", () => {
    expect(ids(listing({ astro: "^5.0.0", react: "19.2.0", vite: "^7.1.0" }))).toEqual(["astro"]);
    expect(ids(listing({ vite: "^7.1.0", react: "19.2.0" }, { hono: "^4.9.0" }))).toEqual([
      "react",
    ]);
  });

  it("tells a server alone, Hono among the dev dependencies where nothing else is listed, and nothing for a project of none", () => {
    expect(ids(listing({ express: "^5.1.0" }))).toEqual(["express"]);
    expect(ids(listing({}, { hono: "^4.9.0" }))).toEqual(["hono"]);
    expect(ids(listing({ lodash: "^4.17.0" }))).toEqual([]);
  });

  it("tells Koa, hapi, Elysia, h3 and Nitro beside a page too, and h3 and Nitro under Nuxt and SolidStart as theirs", () => {
    expect(ids(listing({ koa: "^3.0.0", react: "19.2.0" }, { vite: "^7.1.0" }))).toEqual([
      "react",
      "koa",
    ]);
    expect(ids(listing({ "@hapi/hapi": "^21.4.0", vue: "^3.5.0" }, { vite: "^7.1.0" }))).toEqual([
      "vue",
      "hapi",
    ]);
    expect(ids(listing({ elysia: "^1.4.0", react: "19.2.0" }, { vite: "^7.1.0" }))).toEqual([
      "react",
      "elysia",
    ]);
    expect(
      ids(listing({ nitro: "^3.0.0", h3: "^2.0.0", react: "19.2.0" }, { vite: "^7.1.0" })),
    ).toEqual(["react", "h3", "nitro"]);
    expect(ids(listing({ nuxt: "^4.2.0", h3: "^1.15.0" }))).toEqual(["nuxt"]);
    expect(ids(listing({ "@solidjs/start": "^1.2.0", nitro: "^3.0.0" }))).toEqual(["solid-start"]);
    expect(ids(listing({ koa: "^3.0.0" }))).toEqual(["koa"]);
  });

  it("tells no framework beside h3 or Nitro for a page whose framework no list knows: Analog's, or one Vite builds", () => {
    const ANALOG = { "@angular/core": "^20.3.0", "@analogjs/platform": "^2.0.0", h3: "^1.15.0" };

    expect(ids(listing(ANALOG))).toEqual([]);
    expect(ids(listing({ h3: "^2.0.0" }, { vite: "^7.1.0" }))).toEqual([]);
    expect(ids(listing({ nitro: "^3.0.0" }, { vite: "^7.1.0" }))).toEqual([]);
    expect(ids(listing({ h3: "^2.0.0" }))).toEqual(["h3"]);
    expect(ids(listing({ koa: "^3.0.0" }, { vite: "^7.1.0" }))).toEqual(["koa"]);
  });

  it("sets Courier up in none of the servers it only tells", () => {
    expect(detectFramework(listing({ koa: "^3.0.0" }))).toBeUndefined();
    expect(
      detectFramework(listing({ koa: "^3.0.0", react: "19.2.0" }, { vite: "^7.1.0" }))?.id,
    ).toBe("react");
  });

  it("leaves detectFramework's one framework as it was, for the recipe", () => {
    expect(
      detectFramework(listing({ express: "^5.1.0", react: "19.2.0", vite: "^7.1.0" }))?.id,
    ).toBe("express");
  });
});
