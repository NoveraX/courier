/**
 * Vitest global setup for `@noverax/courier` tests.
 *
 * Vitest's default Node environment has no `globalThis.location`, but the
 * proxy-mode caller relies on it (via `resolveProxyPath`) to turn relative
 * paths into absolute URLs. We install a stub here so existing tests that
 * mock `fetch` continue to work without each one stubbing location locally.
 *
 * Tests that need to assert the *absence* of location (e.g.
 * `resolve-proxy-path.test.ts`) clear it explicitly inside their own
 * `beforeEach` / `afterEach` blocks.
 */

if ((globalThis as { location?: unknown }).location === undefined) {
  (globalThis as { location?: { protocol: string; host: string; origin: string } }).location = {
    protocol: "http:",
    host: "localhost",
    origin: "http://localhost",
  };
}

/* The log settings of the shell a suite runs in are not the suite's: a
   COURIER_LOG_LEVEL=error exported there would hide the warnings tests
   assert, and a FORCE_COLOR would colour lines tests expect plain. Tests
   that need one stub it themselves. */
for (const name of ["COURIER_LOG_LEVEL", "FORCE_COLOR", "NO_COLOR"]) {
  delete process.env[name];
}
