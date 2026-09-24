/**
 * `studio.port` and `studio.host` are documented, typed, and read by every
 * client that dials Studio. The server ignored them, so configuring the
 * documented field moved the clients and left the server where it was.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT, STUDIO_DEFAULT_URL } from "@noverax/courier/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioAddress } from "../src/server/studio-address";

const roots: string[] = [];

function project(config: string): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-studio-"));
  writeFileSync(join(dir, "courier.config.ts"), config);
  roots.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the shared default address", () => {
  /** Both sides read the same name, so the resolver treats them alike. */
  it("is a name rather than a literal IP", () => {
    expect(STUDIO_DEFAULT_HOST).toBe("localhost");
    expect(STUDIO_DEFAULT_URL).toContain("localhost");
  });

  it("is the port the documentation promises", () => {
    expect(STUDIO_DEFAULT_PORT).toBe(6280);
    expect(STUDIO_DEFAULT_URL).toBe(`http://${STUDIO_DEFAULT_HOST}:${STUDIO_DEFAULT_PORT}`);
  });
});

describe("reading the address a project asks for", () => {
  it("returns what the config declares", async () => {
    const root = project(
      `export default { sources: {}, studio: { host: "0.0.0.0", port: 7777 } }\n`,
    );

    expect(await readStudioAddress(root)).toEqual({ host: "0.0.0.0", port: 7777 });
  });

  it("returns whether the config asks for a browser", async () => {
    /* `studio.open` was typed and documented, and nothing read it. */
    const root = project(`export default { sources: {}, studio: { open: true } }\n`);

    expect((await readStudioAddress(root)).open).toBe(true);
  });

  it("returns nothing when the config declares no studio block", async () => {
    const root = project(`export default { sources: {} }\n`);

    expect(await readStudioAddress(root)).toEqual({ host: undefined, port: undefined });
  });

  it("returns nothing when there is no config at all", async () => {
    const root = mkdtempSync(join(tmpdir(), "courier-studio-"));
    roots.push(root);

    expect(await readStudioAddress(root)).toEqual({});
  });

  /** A broken config is reported by the real load, not by the address read. */
  it("does not throw on a config that will not load", async () => {
    const root = project(`import { nope } from "./missing"\nexport default { sources: { nope } }\n`);

    await expect(readStudioAddress(root)).resolves.toEqual({});
  });

  it("logs why a config that will not load gave no address, at debug level", async () => {
    const root = project(`import { nope } from "./missing"\nexport default { sources: { nope } }\n`);
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    await readStudioAddress(root);

    expect(debug).toHaveBeenCalledWith(
      "%s",
      expect.stringContaining(`[Studio] courier.config in ${root} could not be read for Studio's address`),
      expect.objectContaining({ message: expect.stringContaining("missing") }),
    );
  });
});
