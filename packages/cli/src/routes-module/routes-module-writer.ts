import { createLogger } from "@noverax/courier";

import type { LoadedCourierConfig } from "@noverax/courier-studio-core/config";
import type { ProjectRoot } from "../project-fs/project-root";
import { messageOf } from "../util/message-of";
import { composeRoutesModule } from "./compose-routes-module";
import { routesModulePath } from "./routes-module-path";
import { routesSaid } from "./routes-said";
import { writeRoutesModule } from "./write-routes-module";

const log = createLogger("Studio");

/** What the writer reads of a load: the config, and the file it loaded from. */
export type LoadedForRoutes = Pick<LoadedCourierConfig, "config" | "configFile">;

/** Studio's routes module, written again each time the config loads. */
export interface RoutesModuleWriter {
  /**
   * Write the module for a config that loaded and runs. One written while
   * another is being written follows it; of several, the latest alone.
   */
  loaded(loaded: LoadedForRoutes): void;
  /** Write no more, once the module being written is: as Studio stops. */
  close(): Promise<void>;
}

/**
 * Keep a project's routes module as its config says, while Studio runs:
 * written, as the project formats its code, each time the config loads and
 * the module would read otherwise. A warning is said once until something
 * else happens, so a file Studio leaves alone is not named at every save.
 *
 * @param root - The project
 * @returns The writer the config's loads go to
 * @example
 * ```ts
 * const routes = createRoutesModuleWriter(projectRootAt(projectRoot));
 * routes.loaded(await loadCourierConfig(projectRoot.path));
 * ```
 */
export function createRoutesModuleWriter(root: ProjectRoot): RoutesModuleWriter {
  let next: LoadedForRoutes | null = null;
  let running: Promise<void> | null = null;
  let closed = false;
  let lastWarning: string | null = null;

  /* A write is news each time; a warning is said again only once something else came between. */
  function say(level: "info" | "warn" | "debug", message: string): void {
    if (level === "warn" && message === lastWarning) return;
    lastWarning = level === "warn" ? message : null;
    log[level](message);
  }

  async function write(loaded: LoadedForRoutes): Promise<void> {
    const path = routesModulePath(loaded.configFile, loaded.config.studio?.routes);
    if (path === null) return;
    const { module, problem } = composeRoutesModule(root.path, loaded, path);
    if (problem !== null) return say("warn", `Studio cannot write ${path}: ${problem}`);
    const outcome = await writeRoutesModule(root, module);
    const [level, message] = routesSaid(outcome);
    say(level, message);
  }

  async function drain(): Promise<void> {
    for (let loaded = next; loaded !== null && !closed; loaded = next) {
      next = null;
      try {
        await write(loaded);
      } catch (error) {
        say("warn", `Studio could not write the routes module: ${messageOf(error)}`);
        log.debug("Studio could not write the routes module", error);
      }
    }
    running = null;
  }

  return {
    loaded(loaded) {
      if (closed) return;
      next = loaded;
      /* Composed after the load's outcome is applied and told, not inside it. */
      running ??= Promise.resolve().then(drain);
    },
    async close() {
      closed = true;
      next = null;
      await running;
    },
  };
}
