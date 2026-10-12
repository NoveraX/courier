import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { checkRun } from "../src/check-run";
import { projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

describe("checkRun", () => {
  it("lets a run with no import through, and an import from a URL, standard input or a file that is there", () => {
    const spec = join(projectWith({ "openapi.json": "{}" }), "openapi.json");

    expect(() => checkRun({})).not.toThrow();
    expect(() => checkRun({ openapi: "https://example.com/openapi.json" })).not.toThrow();
    expect(() => checkRun({ openapi: "-" })).not.toThrow();
    expect(() => checkRun({ openapi: spec, name: "billing" })).not.toThrow();
  });

  it("refuses an import without Studio, which runs it", () => {
    expect(() => checkRun({ openapi: "https://example.com/openapi.json", studio: false })).toThrow(
      "--openapi imports with Studio's command: leave out --no-studio",
    );
  });

  it("refuses a specification file that is not there, naming where it looked", () => {
    expect(() => checkRun({ openapi: "./no-such-spec.json" })).toThrow(
      new Error(
        `--openapi: there is no ./no-such-spec.json here, at ${resolve("no-such-spec.json")}`,
      ),
    );
  });

  it("refuses an API's name with no import to give it to", () => {
    expect(() => checkRun({ name: "billing" })).toThrow(
      "--name names the API --openapi imports: give the two together",
    );
  });
});
