/**
 * What one bundler built of a scenario, or the breach its failure is: the
 * bundler's own message, which says what it could not build, rather than
 * the stack of the script that ran it, so that the check reports it beside
 * every other breach and goes on to the rest.
 *
 * @template T
 * @param {string} scenario - The scenario's name
 * @param {string} bundler - The bundler's name
 * @param {() => T | Promise<T>} build - The build
 * @returns {Promise<{ start: T } | { breach: string }>} What it built, or why it did not
 * @example
 * const built = await builtOrFailed("direct caller", "webpack", () => webpackStart(webpack, entry, out, []));
 */
export async function builtOrFailed(scenario, bundler, build) {
  try {
    return { start: await build() };
  } catch (error) {
    return { breach: buildFailure(scenario, bundler, error) };
  }
}

/**
 * The breach a bundler's failure to build a scenario is, in the bundler's
 * own words.
 *
 * @param {string} scenario - The scenario's name
 * @param {string} bundler - The bundler's name
 * @param {unknown} error - What the bundler threw
 * @returns {string} The breach
 * @example
 * buildFailure("definitions", "esbuild", new Error("Build failed with 1 error"));
 */
export function buildFailure(scenario, bundler, error) {
  const message = error instanceof Error ? error.message : String(error);
  return `${scenario} does not build under ${bundler}: ${message.trim()}`;
}

/**
 * What a build that runs at once breaches, or the breach its failure is,
 * in the bundler's own words.
 *
 * @param {string} scenario - What was built
 * @param {string} bundler - The bundler's name, or the runtime it built for
 * @param {() => string[]} find - The build, and the breaches of what it built
 * @returns {string[]} The breaches
 * @example
 * const breaches = breachesOrFailure("the core's root", "Node", () => runtimeBreachesOf(runtime));
 */
export function breachesOrFailure(scenario, bundler, find) {
  try {
    return find();
  } catch (error) {
    return [buildFailure(scenario, bundler, error)];
  }
}
