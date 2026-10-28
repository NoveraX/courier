import type { LoadConfigFileOptions } from "../config/load-config";
import type { RoutesInputs, RoutesRequest } from "./routes-snapshot";
import { trackEnvReads } from "./track-env-reads";
import { trackModuleFiles } from "./track-module-files";

/** What one reading of the routes has read so far, noted as it runs. */
export interface ReadingTracker {
  /** What the config's loader is told: each module it loads, and when the config's own code runs. */
  readonly loadOptions: Pick<LoadConfigFileOptions, "onModule" | "beforeRun" | "runTransform">;
  /** Note the config the reading reads, and where one was looked for before it. */
  noteConfig(configFile: string, lookedFor: readonly string[]): void;
  /**
   * Everything read so far: once the routes are read, what they depend on;
   * when the reading failed, what may mend it.
   */
  inputs(): Promise<RoutesInputs>;
}

/**
 * Note what one reading of the routes reads, from now on: the modules Node
 * and the config's loader load, and the environment variables the config's
 * code looks at once it runs, besides the config and the env files.
 *
 * @param request - The reading's request, whose env files are read before it
 * @returns The tracker
 * @example
 * ```ts
 * const reading = trackReading(request);
 * await loadProjectConfig(configFile, request, reading.loadOptions);
 * await reading.inputs(); // { configFile, files: [...], env: ["API_URL"] }
 * ```
 */
export function trackReading(request: RoutesRequest): ReadingTracker {
  const modules = trackModuleFiles();
  const env = trackEnvReads({ paused: true });
  let configFile: string | undefined;
  const looked = new Set<string>();
  return {
    loadOptions: { onModule: modules.noteFile, beforeRun: env.resume, runTransform: env.untracked },
    noteConfig(file, lookedFor) {
      configFile = file;
      looked.add(file);
      for (const path of lookedFor) looked.add(path);
    },
    inputs: async () => ({
      configFile,
      files: [...new Set([...looked, ...request.envFiles, ...(await modules.files())])].sort(),
      env: env.names(),
    }),
  };
}
