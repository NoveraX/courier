/**
 * Vitest setup for the Studio UI's tests, after the repository's own.
 *
 * jsdom implements no scrolling, and the router scrolls the window to the
 * top on every navigation: each scroll printed "Not implemented:
 * window.scrollTo" into the test output, hundreds of lines a run, which
 * buried the warnings a reader looks for. A component test that asserts a
 * scroll stubs it itself.
 */
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}
