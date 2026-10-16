import { binds } from "../../edit/imports";
import { scanSource } from "../../edit/source-scan";
import type { Project } from "../../project/read-project";
import type { ManualStep } from "../recipe-types";

/* What Courier's routes are imported as where the file binds `courier` to something else. */
const OTHER_NAMES = ["courierRoutes", "courierRouter", "courierProxyRoutes"] as const;

/**
 * The step that mounts Courier's routes by hand, in the file the edit would
 * have changed: under `courier`, or — where the file binds that name to
 * something else — under a name it leaves free, so the lines never bind
 * one twice. A file not there yet is called your server.
 *
 * @param project - The project
 * @param file - The server's file, relative to the root
 * @param what - What the step does
 * @param specifier - Courier's routes, as the file imports them
 * @param use - The line that mounts them, under the name they are imported as
 * @returns The step
 * @example
 * ```ts
 * mountStep(project, "src/index.ts", "Mount Courier's routes", "./courier/routes.js", (name) => `app.use(${name});`);
 * ```
 */
export function mountStep(
  project: Project,
  file: string,
  what: string,
  specifier: string,
  use: (name: string) => string,
): ManualStep {
  const text = project.read(file);
  const scan = text === undefined ? undefined : scanSource(text);
  const taken = scan !== undefined && binds(scan, "courier");
  const name = taken
    ? (OTHER_NAMES.find((other) => !binds(scan, other)) ?? OTHER_NAMES[0])
    : "courier";
  const imported = name === "courier" ? "{ courier }" : `{ courier as ${name} }`;
  return {
    file: text === undefined ? "your server" : file,
    what: taken ? `${what}: the file binds courier already, so they come in as ${name}` : what,
    lines: [`import ${imported} from "${specifier}";`, use(name)],
  };
}
