import { posix } from "node:path";
import type { SetupChoices } from "../recipes/recipe-types";
import { firstFreePort } from "./free-port";
import type { Project } from "./read-project";

/** Where Studio listens unless its config moves it. */
export const STUDIO_DEFAULT_PORT = 6280;
/** Where the example's mock listens unless another process took the port first. */
export const MOCK_DEFAULT_PORT = 7001;

/** The ports Studio and the example's mock take. */
export interface Ports {
  readonly studio: number;
  readonly mock: number;
}

/* A port a file of Courier's names, the way the command writes it. */
function portIn(text: string | undefined, pattern: RegExp): number | undefined {
  const found = text === undefined ? undefined : pattern.exec(text)?.[1];
  return found === undefined ? undefined : Number(found);
}

/* The config as the project writes it: courier.config.ts, and the module it passes its list on from, where it does. */
function configText(project: Project): string | undefined {
  const config = project.read("courier.config.ts");
  const from =
    config && /export\s*\{\s*default\s*\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/.exec(config)?.[1];
  if (!from) return config;
  const module = posix.normalize(from).replace(/\.js$/, "");
  return `${config}\n${project.read(`${module}.ts`) ?? project.read(module) ?? ""}`;
}

/**
 * The ports Studio and the example's mock take. A project set up before
 * keeps the ones its files name; a new setup takes the defaults, or the
 * next free ones where something listens there already — another
 * project's Studio, say — so it starts the first time.
 *
 * @param project - The project
 * @param choices - What is set up
 * @returns The ports
 * @example
 * ```ts
 * await portsOf(project, choices); // { studio: 6281, mock: 7001 } while another Studio runs
 * ```
 */
export async function portsOf(project: Project, choices: SetupChoices): Promise<Ports> {
  const config = configText(project);
  const mocks = project.read("courier.mocks.ts");
  const studio =
    portIn(config, /studio:\s*\{\s*port:\s*(\d+)/) ??
    (config === undefined && choices.studio
      ? await firstFreePort(STUDIO_DEFAULT_PORT)
      : STUDIO_DEFAULT_PORT);
  const wantsMock = choices.mocks && choices.openapi === undefined;
  const mock =
    portIn(mocks, /port:\s*(\d+)/) ??
    (mocks === undefined && wantsMock ? await firstFreePort(MOCK_DEFAULT_PORT) : MOCK_DEFAULT_PORT);
  return { studio, mock };
}
