import { afterAll, describe, expect, it } from "vitest";

import { frameworkOf } from "../src/framework-of";
import { readProject } from "../src/project/read-project";
import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function projectListing(dependencies: Record<string, string>) {
  return readProject(
    projectWith({ "package.json": manifest(dependencies), "tsconfig.json": "{}" }),
  );
}

describe("frameworkOf", () => {
  it("finds the framework the project lists, and takes --framework where the project lists it", () => {
    const next = projectListing({ next: "16.4.0", react: "19.2.0" });

    expect(frameworkOf(next, undefined).id).toBe("next");
    expect(frameworkOf(next, "next").id).toBe("next");
  });

  it("refuses a --framework the project is not built with, naming the one it is", () => {
    const express = projectListing({ express: "^5.2.1" });

    expect(() => frameworkOf(express, "next")).toThrow(
      "--framework next sets Next.js up, but this project is built with Express: leave out --framework",
    );
  });

  it("refuses a framework the project lists only for its tools, as Studio's mock lists Hono", () => {
    const next = projectListing({ next: "16.4.0", react: "19.2.0", hono: "^4.13.13" });

    expect(() => frameworkOf(next, "hono")).toThrow("but this project is built with Next.js");
  });

  it("tells an app set up before by its own framework, not by Hono, which the mock installed as a dev dependency", () => {
    const set = (dependencies: Record<string, string>) =>
      readProject(
        projectWith({
          "package.json": manifest(dependencies, {
            devDependencies: { hono: "^4.9.0", "@hono/node-server": "^1.19.0" },
          }),
          "tsconfig.json": "{}",
        }),
      );

    expect(frameworkOf(set({ express: "^5.1.0" }), undefined).id).toBe("express");
    expect(frameworkOf(set({ express: "^5.1.0" }), "express").id).toBe("express");
    expect(frameworkOf(set({ vite: "^7.1.0", react: "19.2.0" }), undefined).id).toBe("react");
    expect(frameworkOf(set({ vite: "^7.1.0", vue: "^3.5.0" }), undefined).id).toBe("vue");
  });

  it("tells Hono where it is a dev dependency and no other framework is listed, as for a worker a bundler builds", () => {
    const hono = readProject(
      projectWith({
        "package.json": manifest({}, { devDependencies: { hono: "^4.9.0" } }),
        "tsconfig.json": "{}",
      }),
    );

    expect(frameworkOf(hono, "hono").id).toBe("hono");
    expect(frameworkOf(hono, undefined).id).toBe("hono");
    expect(() =>
      frameworkOf(
        readProject(
          projectWith({
            "package.json": manifest(
              { express: "^5.1.0" },
              { devDependencies: { hono: "^4.9.0" } },
            ),
            "tsconfig.json": "{}",
          }),
        ),
        "hono",
      ),
    ).toThrow("but this project is built with Express");
  });

  it("tells a Hono app by Hono among the packages it runs with", () => {
    expect(frameworkOf(projectListing({ hono: "^4.9.0" }), undefined).id).toBe("hono");
  });

  it("says when the project lists no framework it knows", () => {
    const plain = projectListing({ lodash: "^4.17.0" });

    expect(() => frameworkOf(plain, "react")).toThrow(
      "but this project lists no framework Courier sets up",
    );
    expect(() => frameworkOf(plain, undefined)).toThrow("No framework Courier sets up was found");
  });
});
