import type { RoutesModuleOutcome } from "./write-routes-module";

/** How loud a line is, and what it says. */
export type SaidLine = readonly ["info" | "warn" | "debug", string];

/**
 * What to say of a routes module once it is written, or checked: the file,
 * and how many endpoints a page may call of which sources.
 *
 * @param outcome - What writing or checking the module came to
 * @returns The level to say it at, and the line
 * @example
 * ```ts
 * routesSaid(await writeRoutesModule(root, composed));
 * // → ["info", "Wrote courier.routes.ts: 3 endpoints a page may call, of api"]
 * ```
 */
export function routesSaid({ status, module, formatting }: RoutesModuleOutcome): SaidLine {
  const { path, endpoints, sources } = module;
  const what =
    endpoints === 0
      ? "no endpoint is marked .expose(), so a page may call none"
      : `${endpoints} endpoint${endpoints === 1 ? "" : "s"} a page may call, of ${sources.join(", ")}`;
  switch (status) {
    case "written":
      return formatting === null
        ? ["info", `Wrote ${path}: ${what}`]
        : ["warn", `Wrote ${path}, not formatted as the project's code: ${formatting}`];
    case "unchanged":
      return ["debug", `${path} is up to date: ${what}`];
    case "none":
      return ["debug", `No endpoint is marked .expose(), so there is no ${path} to write`];
    case "stale":
      return ["warn", `${path} is out of date; \`courier-studio routes\` writes it again: ${what}`];
    case "foreign":
      return [
        "warn",
        `${path} holds code Studio did not write, so Studio leaves it; name another file with studio.routes in courier.config`,
      ];
  }
}
