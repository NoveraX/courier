import { join } from "node:path";
import { styleFor } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { CancelledError } from "../../src/cancelled-error";
import type { CreateRun } from "../../src/create-run";
import type { Questions } from "../../src/questions/questions";
import { type ChoicePlace, setupChoices } from "../../src/questions/setup-choices";
import { textReport } from "../../src/report/text-report";
import { projectWith, removeProjects } from "../recipes/project-fixture";
import { CTRL_C, scripted } from "./scripted-questions";

afterAll(removeProjects);

const NEW: ChoicePlace = { configured: false, routes: true, agentRules: false };

function choicesAt(run: CreateRun, questions: Questions | undefined, place = NEW) {
  const report = textReport(styleFor(undefined), () => undefined);
  return setupChoices(run, { questions, report, toolOutput: "stdout" }, place);
}

const API = "Your API?";
const STUDIO = "Set Courier Studio up, to watch your API's calls?";
const MOCK = "Run the example's mock with Studio, so the app answers before it has a backend?";
const MCP = "Offer the API's reads to AI agents in your editor, over MCP?";
const AGENT_DOCS =
  "Point your editor's agent at the docs of the Courier you install, in AGENTS.md?";
const ROUTES = "Where do pages take their routes from?";
const SPEC = "The specification's URL, or its file:";

describe("setupChoices", () => {
  it("asks for the API, Studio, the mock, agents, their docs and the routes, in turn, each with the answer it takes without one", async () => {
    const questions = scripted(["example", true, true, false, false, "file"]);

    const choices = await choicesAt({}, questions, { ...NEW, agentRules: true });

    expect(questions.asked.map(({ message, initial }) => [message, initial])).toEqual([
      [API, "example"],
      [STUDIO, true],
      [MOCK, true],
      [MCP, false],
      [AGENT_DOCS, false],
      [ROUTES, "plugin"],
    ]);
    expect(choices).toEqual({
      example: true,
      studio: true,
      mocks: true,
      mcp: false,
      agentRules: false,
      name: undefined,
      routes: "file",
    });
  });

  it("asks nothing the command line answers", async () => {
    const run = {
      example: true,
      studio: true,
      mocks: false,
      mcp: true,
      "agents-md": true,
      routes: "plugin",
    };

    const choices = await choicesAt(run, scripted([]), { ...NEW, agentRules: true });

    expect(choices).toMatchObject({
      example: true,
      studio: true,
      mocks: false,
      mcp: true,
      agentRules: true,
    });
  });

  it("asks nothing without a terminal, with --yes or with --dry-run, and takes the answers it takes without one", async () => {
    const wanted = { ...NEW, agentRules: true };
    const without = await choicesAt({}, undefined, wanted);
    const yes = await choicesAt({ yes: true }, scripted([]), wanted);
    const dry = await choicesAt({ "dry-run": true }, scripted([]), wanted);

    for (const choices of [without, yes, dry])
      expect(choices).toEqual({
        example: true,
        studio: true,
        mocks: true,
        mcp: false,
        agentRules: false,
        name: undefined,
        routes: undefined,
      });
  });

  it("asks of no mock without Studio, which runs it, nor without the example, and offers no import without Studio", async () => {
    const noStudio = scripted(["example", false, false, "plugin"]);
    const noApi = scripted(["none", true, false, "plugin"]);
    const told = scripted(["example", false, "plugin"]);

    expect(await choicesAt({}, noStudio)).toMatchObject({ studio: false });
    expect(await choicesAt({}, noApi)).toMatchObject({ example: false, studio: true });
    await choicesAt({ studio: false }, told);

    expect(noStudio.asked.map((each) => each.message)).toEqual([API, STUDIO, MCP, ROUTES]);
    expect(noApi.asked.map((each) => each.message)).toEqual([API, STUDIO, MCP, ROUTES]);
    expect(told.asked[0]?.choices).toEqual(["example", "none"]);
  });

  it("imports the specification the person names, asking again while it is no URL or no file here, and sets Studio up to import it", async () => {
    const spec = join(projectWith({ "openapi.json": "{}" }), "openapi.json");
    const questions = scripted([
      "import",
      "./no-such-spec.json",
      "https://",
      "ftp://example.com/spec",
      "https://ana:pw@example.com/spec.json",
      spec,
      false,
      "plugin",
    ]);

    const choices = await choicesAt({}, questions);

    expect(choices).toMatchObject({ example: false, openapi: spec, studio: true });
    expect(questions.asked.map((each) => each.message)).toEqual([API, SPEC, MCP, ROUTES]);
    expect(questions.asked[1]?.refused).toEqual([
      expect.stringMatching(/^There is no \.\/no-such-spec\.json here, at /),
      "No URL can be read from https://",
      "A URL to import from starts with https:// or http://",
      expect.stringMatching(
        /^It carries a user or a password in its address, which Studio refuses with SPEC_CREDENTIALS_IN_URL: .* import https:\/\/example\.com\/spec\.json --basic-env/,
      ),
    ]);
  });

  it("asks a project whose config declares APIs neither for an API nor of the mock, and of the routes only where it has the choice", async () => {
    const questions = scripted([true, false]);

    await choicesAt({}, questions, { configured: true, routes: false, agentRules: false });

    expect(questions.asked.map((each) => each.message)).toEqual([STUDIO, MCP]);
  });

  it("takes --mocks for the example and Studio, which it needs, without asking for them", async () => {
    const questions = scripted([false, "plugin"]);

    expect(await choicesAt({ mocks: true }, questions)).toMatchObject({
      example: true,
      studio: true,
      mocks: true,
    });
    expect(questions.asked.map((each) => each.message)).toEqual([MCP, ROUTES]);
  });

  it("asks of the docs for the editor's agent only where the block would change anything, and takes the flag's answer", async () => {
    const run = { example: true, studio: false };
    const place = { ...NEW, routes: false };
    const asked = scripted([false, true]);
    const unasked = scripted([false]);

    expect(await choicesAt(run, asked, { ...place, agentRules: true })).toMatchObject({
      agentRules: true,
    });
    expect(await choicesAt(run, unasked, place)).toMatchObject({ agentRules: false });
    const flagged = { ...run, mcp: false, "agents-md": true };
    expect(await choicesAt(flagged, scripted([]), place)).toMatchObject({ agentRules: true });
    const declined = { ...run, mcp: false, "agents-md": false };
    expect(await choicesAt(declined, scripted([]), { ...place, agentRules: true })).toMatchObject({
      agentRules: false,
    });

    expect(asked.asked.map(({ message, initial }) => [message, initial])).toEqual([
      [MCP, false],
      [AGENT_DOCS, false],
    ]);
    expect(unasked.asked.map(({ message }) => message)).toEqual([MCP]);
  });

  it("stops at the question the person cancels, before anything is changed", async () => {
    await expect(choicesAt({}, scripted(["example", CTRL_C]))).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});
