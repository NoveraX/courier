/**
 * The code the setup writes takes nothing from the core's root, which
 * gives a page's names and a server's alike: a page's from
 * `@noverax/courier/client`, a server's from `@noverax/courier/server`,
 * in every framework's files and in the lines it leaves to the person.
 */
import { afterAll, describe, expect, it } from "vitest";

import { FRAMEWORKS } from "../../src/frameworks";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const ROOT_IMPORT = /\bfrom\s+["']@noverax\/courier["']/;

describe("the setup's code and the core's entries", () => {
  it.each(
    FRAMEWORKS.flatMap((framework) =>
      framework.recipe === undefined ? [] : [[framework.id, framework] as const],
    ),
  )("%s: imports nothing from the core's root", (_, framework) => {
    const listed = {
      [framework.marker]: "*",
      ...(framework.also ? { [framework.also]: "*" } : {}),
    };
    const root = projectWith({ "package.json": manifest(listed), "tsconfig.json": "{}" });
    const recipe = framework.recipe?.(contextOf(root, framework.marker));
    const written = [
      ...(recipe?.files ?? []).map((file) => [file.path, file.content] as const),
      ...(recipe?.manual ?? []).map((step) => [step.file, step.lines.join("\n")] as const),
    ];

    expect(written.filter(([, text]) => ROOT_IMPORT.test(text)).map(([path]) => path)).toEqual([]);
  });

  it("gives a server's demo its caller from the server's entry", () => {
    const root = projectWith({
      "package.json": manifest({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
    });
    const express = FRAMEWORKS.find((framework) => framework.id === "express");
    const caller = express
      ?.recipe?.(contextOf(root, "express"))
      .files.find((file) => file.path.endsWith("server-caller.ts"));

    expect(caller?.content.split("\n")[0]).toBe(
      'import { createCaller } from "@noverax/courier/server";',
    );
  });
});
