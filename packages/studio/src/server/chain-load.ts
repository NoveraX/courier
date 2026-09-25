import { createLogger } from "@noverax/courier";
import { ConfigLoadTimeoutError } from "./config-load-timeout-error";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import type { ProjectInputs } from "./read-project-inputs";
import { withTimeout } from "./with-timeout";

const log = createLogger("Studio");

/* Loads given up on that still run, in steps of which a warning is logged. */
const WARN_EVERY = 5;

/** How the reload chain loads the project, and who hears of a load it gave up on. */
export interface ChainLoadOptions {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** How long one load may take before it is given up. */
  timeoutMs: number;
  /** Handed what each load read, before it evaluates anything. */
  onInputs?: (inputs: ProjectInputs) => void;
  /**
   * A load that was given up has succeeded after all. Called once for each
   * such load, with the error its caller was thrown when it was given up.
   */
  onLateSuccess(loaded: LoadedCourierConfig, gaveUp: ConfigLoadTimeoutError): void;
  /**
   * A load that was given up has failed after all — the connection it
   * awaited was refused, say. Called once for each such load, with what it
   * threw and the error its caller was thrown when it was given up.
   */
  onLateFailure(error: unknown, gaveUp: ConfigLoadTimeoutError): void;
}

/** One load of the project, as the reload chain makes it. */
export interface ChainLoad {
  /**
   * Load the config and the mocks file as they are on disk now.
   *
   * @throws `ConfigLoadTimeoutError` when it takes longer than the timeout,
   *   or what the loader threw
   */
  load(): Promise<LoadedCourierConfig>;
}

/**
 * Load the project for the reload chain, giving up on a load that takes too
 * long so the chain moves on: a config whose module awaits something that
 * never comes — a database connection — does not hold every reload and edit
 * behind it for good.
 *
 * A load given up keeps running; nothing stops a module's evaluation. It is
 * never returned. Its failure carries what it read before evaluating, so
 * the module that hangs can be watched and fixing it reloads. When it
 * settles later, `onLateSuccess` or `onLateFailure` decides what to do with
 * its outcome. How many loads given up are still running is logged at debug
 * level each time one is given up or settles, since each keeps its modules
 * in memory until then, and warned about each time that count reaches a
 * multiple of five: the memory they hold then grows with each save.
 *
 * @param options - The project root, the timeout, and the callbacks
 * @returns The load the chain calls
 *
 * @example
 * ```ts
 * const chain = createChainLoad({ projectRoot, timeoutMs: CONFIG_LOAD_TIMEOUT_MS, onLateSuccess, onLateFailure });
 * const loaded = await chain.load();
 * ```
 */
export function createChainLoad({
  projectRoot,
  timeoutMs,
  onInputs,
  onLateSuccess,
  onLateFailure,
}: ChainLoadOptions): ChainLoad {
  let givenUp = 0;

  function stillRunning(): string {
    return givenUp === 1
      ? "1 load given up is still running"
      : `${givenUp} loads given up are still running`;
  }

  function lateSuccess(loaded: LoadedCourierConfig, gaveUp: ConfigLoadTimeoutError): void {
    givenUp -= 1;
    log.debug(`A load of courier.config given up on has finished; ${stillRunning()}`);
    onLateSuccess(loaded, gaveUp);
  }

  function lateFailure(error: unknown, gaveUp: ConfigLoadTimeoutError): void {
    givenUp -= 1;
    log.debug(`A load of courier.config given up on has failed; ${stillRunning()}`, error);
    onLateFailure(error, gaveUp);
  }

  function abandon(work: Promise<LoadedCourierConfig>, gaveUp: ConfigLoadTimeoutError): void {
    givenUp += 1;
    log.debug(
      `Stopped waiting for a load of courier.config after ${timeoutMs} ms; ${stillRunning()}`,
    );
    if (givenUp % WARN_EVERY === 0) {
      log.warn(
        `${givenUp} loads of courier.config that Studio stopped waiting for are still running, ` +
          "and each keeps the modules it loaded in memory. Fix what they wait for, then restart Studio to free them.",
      );
    }
    work
      .then(
        (loaded) => lateSuccess(loaded, gaveUp),
        (error: unknown) => lateFailure(error, gaveUp),
      )
      .catch((err: unknown) =>
        log.error("Studio could not take a late outcome of a load of courier.config", err),
      );
  }

  return {
    load(): Promise<LoadedCourierConfig> {
      let inputs: ProjectInputs | undefined;
      const work = loadCourierConfig(projectRoot, {
        onInputs: (read) => {
          inputs = read;
          onInputs?.(read);
        },
      });
      return withTimeout(work, timeoutMs, () => {
        const gaveUp = new ConfigLoadTimeoutError(timeoutMs, inputs);
        abandon(work, gaveUp);
        return gaveUp;
      });
    },
  };
}
