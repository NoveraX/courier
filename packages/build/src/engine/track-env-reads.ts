/** The environment variables code looked at since tracking began. */
export interface EnvReads {
  /** Their names, sorted, or `"*"` once code went through them all. */
  names(): readonly string[] | "*";
}

/**
 * Note every environment variable the code that runs next looks at, by
 * putting a watcher in front of `process.env`: a name read, tested for or
 * described is noted, and listing them all notes them all.
 *
 * @returns What was looked at, asked once the code has run
 * @example
 * ```ts
 * const reads = trackEnvReads();
 * process.env.API_URL;
 * reads.names(); // ["API_URL"]
 * ```
 */
export function trackEnvReads(): EnvReads {
  const read = new Set<string>();
  let all = false;
  const note = (key: string | symbol): void => {
    if (typeof key === "string") read.add(key);
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
      all = true;
      return Reflect.ownKeys(target);
    },
  });
  return { names: () => (all ? "*" : [...read].sort()) };
}
