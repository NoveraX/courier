import { specificationProblem } from "../check-run";
import type { CreateRun } from "../create-run";
import type { RoutesMode, SetupChoices } from "../recipes/recipe-types";
import { routesAsked } from "../routes-mode";
import type { SetupIO } from "../setup-io";
import type { Questions } from "./questions";

/** What the questions depend on in the project the setup is for. */
export interface ChoicePlace {
  /** Whether its config declares APIs already, so that no example is added. */
  readonly configured: boolean;
  /** Whether the person picks where pages take their routes from: Courier's plugin or `courier.routes.ts`, neither set up yet. */
  readonly routes: boolean;
}

type Api = Pick<SetupChoices, "example" | "openapi">;

/* The API to set up: the example, an import, or none yet. An import needs Studio, and the mock the example. */
async function apiOf(run: CreateRun, questions: Questions | undefined, place: ChoicePlace) {
  if (run.openapi !== undefined) return { example: false, openapi: run.openapi };
  if (run.example !== undefined) return { example: run.example };
  if (questions === undefined || place.configured || run.mocks === true) return { example: true };
  const picked = await questions.select<"example" | "import" | "none">(
    "Your API?",
    [
      { value: "example", label: "An example API", hint: "with a page that calls it" },
      ...(run.studio === false
        ? []
        : [
            {
              value: "import" as const,
              label: "Import your specification",
              hint: "OpenAPI, Swagger or Postman, by URL or from a file",
            },
          ]),
      { value: "none", label: "None yet", hint: "add yours to courier.config.ts later" },
    ],
    "example",
  );
  if (picked !== "import") return { example: picked === "example" };
  const openapi = await questions.text("The specification's URL, or its file:", (answer) => {
    const problem = answer === "-" ? "it names no URL or file" : specificationProblem(answer);
    return problem === undefined
      ? undefined
      : `${problem.charAt(0).toUpperCase()}${problem.slice(1)}`;
  });
  return { example: false, openapi };
}

async function routesOf(
  run: CreateRun,
  questions: Questions | undefined,
  place: ChoicePlace,
): Promise<RoutesMode | undefined> {
  const asked = routesAsked(run.routes);
  if (asked !== undefined || questions === undefined || !place.routes) return asked;
  return questions.select<RoutesMode>(
    "Where do pages take their routes from?",
    [
      {
        value: "plugin",
        label: "Courier's plugin for the build",
        hint: "no file to write or commit",
      },
      { value: "file", label: "courier.routes.ts", hint: "a file Studio and the CLI write" },
    ],
    "plugin",
  );
}

/**
 * What the setup sets up: what the command line says, and, where it says
 * nothing, what the person at the terminal answers — every question
 * before anything is changed, each with the answer it takes without one.
 * Without a terminal, with `--yes` and with `--dry-run`, nothing is
 * asked, and those answers are taken: the example, Studio and its mock,
 * no MCP server, and the plugin where there is one.
 *
 * The questions, in turn: the API — the example, an import of a
 * specification, whose URL or file is checked, or none yet — then
 * Studio, which an import needs; the example's mock, where there are
 * Studio and the example; agents over MCP; and where pages take their
 * routes from, where the project has a choice.
 *
 * @param run - What the command line asked for
 * @param io - What the person at the terminal answers, if anyone can
 * @param place - What the questions depend on in the project
 * @returns The choices
 * @throws {CancelledError} When the person cancels a question
 * @example
 * ```ts
 * const choices = await setupChoices({ studio: false }, io, { configured: false, routes: true });
 * ```
 */
export async function setupChoices(
  run: CreateRun,
  io: SetupIO,
  place: ChoicePlace,
): Promise<SetupChoices> {
  const questions = run.yes === true || run["dry-run"] === true ? undefined : io.questions;
  const api: Api = await apiOf(run, questions, place);
  const studio =
    run.studio ??
    (api.openapi !== undefined || run.mocks === true || questions === undefined
      ? true
      : await questions.confirm("Set Courier Studio up, to watch your API's calls?", true));
  const mocks =
    run.mocks ??
    (!studio || !api.example || place.configured || questions === undefined
      ? true
      : await questions.confirm(
          "Run the example's mock with Studio, so the app answers before it has a backend?",
          true,
        ));
  const mcp =
    run.mcp ??
    (questions === undefined
      ? false
      : await questions.confirm(
          "Offer the API's reads to AI agents in your editor, over MCP?",
          false,
        ));
  return {
    ...api,
    studio,
    mocks,
    mcp,
    name: run.name,
    routes: await routesOf(run, questions, place),
  };
}
