/**
 * Where a server runtime dials Studio.
 *
 * `studio.host` and `studio.port` in courier.config move Studio itself, the
 * browser and a server runtime alike: one that loads the config for its
 * sources dials the address it names, not the default one, where nothing
 * listens.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioUrl } from "../src/runtime/runtime-environment";

const dialled: string[] = [];

vi.mock("socket.io-client", () => ({
  io: (url: string) => {
    dialled.push(url);
    const socket = {
      connected: false,
      on: () => socket,
      emit: () => socket,
      removeAllListeners: () => socket,
      disconnect: () => socket,
    };
    return socket;
  },
}));

const { attachRuntime, _resetRuntimeHandlesForTests } = await import(
  "../src/runtime/attach-runtime"
);

const cleanups: Array<() => void> = [];

afterEach(() => {
  _resetRuntimeHandlesForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  dialled.length = 0;
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A project under the repository's node_modules, so its config resolves the workspace packages. */
function projectWithStudio(studio: string): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-core-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, "courier.config.mjs"),
    'import { defineApi } from "@noverax/courier/define";\n' +
      "export default {\n" +
      '  sources: { api: defineApi({ baseURL: "https://api.example", endpoints: {} }) },\n' +
      `  studio: ${studio},\n` +
      "};\n",
  );
  return dir;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("a server runtime", () => {
  it("dials the address courier.config gives Studio", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(projectWithStudio("{ port: 7123 }"));

    await attachRuntime("configured-server");
    await settle();

    expect(dialled).toEqual(["http://localhost:7123/runtime"]);
  });

  it("lets COURIER_STUDIO_URL override the config", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(projectWithStudio('{ host: "0.0.0.0", port: 7123 }'));
    vi.stubEnv("COURIER_STUDIO_URL", "http://studio.internal:9000");

    await attachRuntime("env-server");
    await settle();

    expect(dialled).toEqual(["http://studio.internal:9000/runtime"]);
  });
});

describe("resolveStudioUrl", () => {
  it("fills in the default for whichever half of the address is missing", () => {
    expect(resolveStudioUrl({ host: "127.0.0.1" })).toBe("http://127.0.0.1:6280");
    expect(resolveStudioUrl({ port: 7000 })).toBe("http://localhost:7000");
  });

  it("uses the default address when the config names none", () => {
    expect(resolveStudioUrl({})).toBe("http://localhost:6280");
    expect(resolveStudioUrl()).toBe("http://localhost:6280");
  });
});
