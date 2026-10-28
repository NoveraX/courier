/** The environment variables code looked at since tracking began. */
export interface EnvReads {
  /** Their names, sorted, or `"*"` once code went through them all. */
  names(): readonly string[] | "*";
  /**
   * Run code whose reads are not noted: a loader's own work, such as
   * transforming a module, which reads the environment for itself.
   */
  untracked<TResult>(run: () => TResult): TResult;
  /** Begin noting, for a tracker made paused. */
  resume(): void;
}

/** How tracking begins. */
export interface TrackEnvReadsOptions {
  /**
   * Note nothing until `resume()`: the watcher is in place before code whose
   * reads are not to be noted runs, such as a loader starting up.
   */
  paused?: boolean | undefined;
}

/**
 * Note every environment variable the code that runs next looks at, by
 * putting a watcher in front of `process.env`: a name read, tested for or
 * described is noted, and listing them all notes them all.
 *
 * @param options - Whether to begin paused
 * @returns What was looked at, asked once the code has run
 * @example
 * ```ts
 * const reads = trackEnvReads();
 * process.env.API_URL;
 * reads.names(); // ["API_URL"]
 * ```
 */
export function trackEnvReads({
  paused: startPaused = false,
}: TrackEnvReadsOptions = {}): EnvReads {
  const read = new Set<string>();
  let all = false;
  let waiting = startPaused;
  let paused = waiting ? 1 : 0;
  const note = (key: string | symbol): void => {
    if (paused === 0 && typeof key === "string") read.add(key);
  };
  process.env = new Proxy(process.env, {
    get(target, key) {
      note(key);
      return Reflect.get(target, key);
    },
    has(target, key) {
      note(key);
      return Reflect.has(target, key);
    },
    getOwnPropertyDescriptor(target, key) {
      note(key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    ownKeys(target) {
      if (paused === 0) all = true;
      return Reflect.ownKeys(target);
    },
    /* Written to the environment itself: through the watcher, assigning a variable
       already set would define it with a partial descriptor, which Node refuses. */
    set: (target, key, value) => Reflect.set(target, key, value),
    defineProperty: (target, key, descriptor) => Reflect.defineProperty(target, key, descriptor),
  });
  return {
    names: () => (all ? "*" : [...read].sort()),
    untracked(run) {
      paused += 1;
      try {
        return run();
      } finally {
        paused -= 1;
      }
    },
    resume() {
      if (waiting) paused -= 1;
      waiting = false;
    },
  };
}
