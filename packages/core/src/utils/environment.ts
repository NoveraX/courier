import { ownFields } from "./own";

/**
 * The one way Courier reads the process's environment: a variable the
 * environment has of its own, or none. Node looks a name its environment
 * does not have up on `Object.prototype`, where code elsewhere in the
 * process may have put one, and a variable taken from there would open the
 * checks it configures — a page's origin, a host, a visitor's address. A
 * runtime without an environment of its own — a page, an edge route
 * without `process` — has none.
 */

/* The process's environment, where the runtime has a `process` of its own. */
function environment(): object | undefined {
  const runtime: unknown = Object.hasOwn(globalThis, "process")
    ? Reflect.get(globalThis, "process")
    : undefined;
  const env: unknown =
    typeof runtime === "object" && runtime !== null ? Reflect.get(runtime, "env") : undefined;
  return typeof env === "object" && env !== null ? env : undefined;
}

/**
 * A variable of the process's environment, where the environment has it of
 * its own.
 *
 * @param name - The variable
 * @returns Its value; `undefined` where the environment has none of its own
 * @example
 * ```ts
 * environmentVariable("COURIER_ALLOWED_ORIGINS"); // undefined, whatever Object.prototype holds
 * ```
 */
export function environmentVariable(name: string): string | undefined {
  const env = environment();
  if (env === undefined || !Object.hasOwn(env, name)) return undefined;
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" ? value : undefined;
}

/**
 * The process's environment, of its own variables alone: what a reader of
 * several variables at once — a terminal's colours — is handed.
 *
 * @returns The variables, in an object that stands on nothing
 * @example
 * ```ts
 * const { TERM } = ownEnvironment();
 * ```
 */
export function ownEnvironment(): Readonly<Record<string, string | undefined>> {
  return ownFields((environment() ?? {}) as Readonly<Record<string, string | undefined>>);
}

/**
 * A variable as a bundler may write it in — `process.env.NODE_ENV`, or one an
 * application's build inlines into a page — or else as the environment has
 * it of its own. The caller writes the plain member access, which a bundler
 * replaces with the build's value; where none did, it read the environment,
 * and a value it found on `Object.prototype` for a name the environment does
 * not have is none.
 *
 * @param name - The variable
 * @param written - `process.env.<name>`, as the caller writes it
 * @returns The value
 * @example
 * ```ts
 * writtenOrOwn("COURIER_STUDIO_URL", process.env.COURIER_STUDIO_URL);
 * ```
 */
export function writtenOrOwn(name: string, written: string | undefined): string | undefined {
  if (written === undefined || written !== Reflect.get(Object.prototype, name)) return written;
  const env = environment();
  return env !== undefined && Object.hasOwn(env, name) ? written : undefined;
}

/**
 * `NODE_ENV`, as a bundler writes it in or the environment has it of its own.
 *
 * @returns Its value, or `undefined` where neither says one
 * @example
 * ```ts
 * if (nodeEnvironment() === "production") return true;
 * ```
 */
export function nodeEnvironment(): string | undefined {
  return writtenOrOwn(
    "NODE_ENV",
    typeof process === "undefined" ? undefined : process.env.NODE_ENV,
  );
}
