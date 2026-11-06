import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { SetupRefusal } from "../src/apply/setup-refusal";
import { checkRun, specificationProblem } from "../src/check-run";
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

  it("refuses the example's mock without Studio, which runs it, and beside an import, which takes the example's place", () => {
    expect(() => checkRun({ mocks: true, studio: false })).toThrow(
      "--mocks adds the example's mock, which Studio runs: leave out --no-studio",
    );
    expect(() => checkRun({ mocks: true, openapi: "https://example.com/openapi.json" })).toThrow(
      "--mocks adds the example's mock, and --openapi imports your API in the example's place: leave out --mocks",
    );
    expect(() => checkRun({ studio: false })).not.toThrow();
    expect(() => checkRun({ studio: false, mocks: false })).not.toThrow();
  });

  it("refuses the example beside an import, which takes its place, and the mock without the example", () => {
    expect(() => checkRun({ example: true, openapi: "https://example.com/openapi.json" })).toThrow(
      "--example adds the example API, and --openapi imports yours in its place: give one of the two",
    );
    expect(() => checkRun({ example: false, mocks: true })).toThrow(
      "--mocks adds the example's mock: leave out --no-example",
    );
    expect(() => checkRun({ example: false })).not.toThrow();
  });

  it("refuses a URL that is none, and one read otherwise than over HTTP", () => {
    expect(() => checkRun({ openapi: "https://" })).toThrow(
      "--openapi: no URL can be read from https://",
    );
    expect(() => checkRun({ openapi: "ftp://example.com/openapi.json" })).toThrow(
      "--openapi: a URL to import from starts with https:// or http://",
    );
  });

  it("refuses an address with a user or a password in it before anything is installed, as Studio does, naming it without them", () => {
    /* Made up for the test. */
    const password = "pw-made-up-41c7";
    let refusal: unknown;
    try {
      checkRun({ openapi: `https://ana:${password}@specs.example/pets.json` });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(SetupRefusal);
    expect(refusal).toMatchObject({
      code: "SPEC_CREDENTIALS_IN_URL",
      message:
        "--openapi: it carries a user or a password in its address, which Studio refuses with SPEC_CREDENTIALS_IN_URL: import its file, or set Courier up without the import, then run npx @noverax/courier-studio import https://specs.example/pets.json --basic-env USER_VARIABLE:PASSWORD_VARIABLE, which reads the two from those environment variables",
    });
    expect(specificationProblem("https://ana@specs.example/pets.json")).toMatch(
      /^it carries a user or a password in its address/,
    );
    expect(specificationProblem(`https://ana:${password}@`)).not.toContain(password);
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
