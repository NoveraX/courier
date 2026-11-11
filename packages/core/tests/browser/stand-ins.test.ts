/**
 * Each module only a server runs has its stand-in under `src/browser/`,
 * which a page's bundle takes in its place: one of the same path, with the
 * same exports, built to `lib/browser/` beside the module itself.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SERVER_ONLY_MODULES, serverOnlyEntries } from "../../tsdown.server-only";

const SOURCE = new URL("../../src/", import.meta.url);

/* The names a source module exports, by its path under `src/`. */
async function exportsOf(path: string): Promise<string[]> {
  const module: Record<string, unknown> = await import(fileURLToPath(new URL(path, SOURCE)));
  return Object.keys(module).sort();
}

describe("the stand-ins of the modules only a server runs", () => {
  it.each(SERVER_ONLY_MODULES)("%s has one with the same exports", async (module) => {
    const server = await exportsOf(`${module}.ts`);

    expect(await exportsOf(`browser/${module}.ts`)).toEqual(server);
    expect(server.length).toBeGreaterThan(0);
  });

  it("are built beside the modules themselves", () => {
    expect(serverOnlyEntries()).toEqual({
      "logger/server": "src/logger/server.ts",
      "browser/logger/server": "src/browser/logger/server.ts",
      "errors/http-error-inspect": "src/errors/http-error-inspect.ts",
      "browser/errors/http-error-inspect": "src/browser/errors/http-error-inspect.ts",
      "utils/answered-message": "src/utils/answered-message.ts",
      "browser/utils/answered-message": "src/browser/utils/answered-message.ts",
      "utils/send-streamed": "src/utils/send-streamed.ts",
      "browser/utils/send-streamed": "src/browser/utils/send-streamed.ts",
      "utils/attempt-expiry": "src/utils/attempt-expiry.ts",
      "browser/utils/attempt-expiry": "src/browser/utils/attempt-expiry.ts",
      "define/announce-source": "src/define/announce-source.ts",
      "browser/define/announce-source": "src/browser/define/announce-source.ts",
      "capabilities/registry": "src/capabilities/registry.ts",
      "browser/capabilities/registry": "src/browser/capabilities/registry.ts",
      "capabilities/missing-capability": "src/capabilities/missing-capability.ts",
      "browser/capabilities/missing-capability": "src/browser/capabilities/missing-capability.ts",
      "utils/upload-without-progress": "src/utils/upload-without-progress.ts",
      "browser/utils/upload-without-progress": "src/browser/utils/upload-without-progress.ts",
      "utils/one-users-call": "src/utils/one-users-call.ts",
      "browser/utils/one-users-call": "src/browser/utils/one-users-call.ts",
      "utils/server-call-marks": "src/utils/server-call-marks.ts",
      "browser/utils/server-call-marks": "src/browser/utils/server-call-marks.ts",
      "studio/singleton": "src/studio/singleton.ts",
      "browser/studio/singleton": "src/browser/studio/singleton.ts",
      "utils/request-members": "src/utils/request-members.ts",
      "browser/utils/request-members": "src/browser/utils/request-members.ts",
      "utils/browser-page": "src/utils/browser-page.ts",
      "browser/utils/browser-page": "src/browser/utils/browser-page.ts",
      "utils/page-location": "src/utils/page-location.ts",
      "browser/utils/page-location": "src/browser/utils/page-location.ts",
      "utils/is-react-native": "src/utils/is-react-native.ts",
      "browser/utils/is-react-native": "src/browser/utils/is-react-native.ts",
    });
  });
});
