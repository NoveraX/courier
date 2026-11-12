/**
 * Studio's routes module, written as the config loads: one write at a time,
 * the latest load after it; nothing once Studio stops; and what it comes to
 * said once, not at every save.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectRootAt } from "../../src/project-fs/project-root";
import {
  createRoutesModuleWriter,
  type LoadedForRoutes,
} from "../../src/routes-module/routes-module-writer";
import { stubOwnEnvironment } from "../helpers/own-environment";

const { endpoint } = courier();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-routes-writer-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function loadedWith(name: string, studio?: CourierConfig["studio"]): LoadedForRoutes {
  const api = defineApi({
    baseURL: "https://api.example.com",
    endpoints: { [name]: endpoint.get(name).expose() },
  });
  return {
    config: { sources: { api }, ...(studio && { studio }) },
    configFile: join(dir, "courier.config.ts"),
  };
}

describe("createRoutesModuleWriter", () => {
  it("writes the module of the latest load once the write in hand is done, and no load between", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const writer = createRoutesModuleWriter(projectRootAt(dir));
    const written = () => readFileSync(join(dir, "courier.routes.ts"), "utf8");

    writer.loaded(loadedWith("first"));
    await vi.waitFor(() => expect(written()).toContain('"first"'));
    writer.loaded(loadedWith("second"));
    writer.loaded(loadedWith("third"));
    await vi.waitFor(() => expect(written()).toContain('"third"'));
    await writer.close();

    expect(
      info.mock.calls
        .flat()
        .join("\n")
        .match(/Wrote courier\.routes\.ts/g),
    ).toHaveLength(2);
  });

  it("writes nothing once Studio stops", async () => {
    const writer = createRoutesModuleWriter(projectRootAt(dir));
    await writer.close();

    writer.loaded(loadedWith("late"));
    await writer.close();

    expect(existsSync(join(dir, "courier.routes.ts"))).toBe(false);
  });

  it("writes nothing when the config says false", async () => {
    const writer = createRoutesModuleWriter(projectRootAt(dir));

    writer.loaded(loadedWith("health", { routes: false }));
    await writer.close();

    expect(existsSync(join(dir, "courier.routes.ts"))).toBe(false);
  });

  it("says once that it leaves a file Courier did not write, however often the config loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(join(dir, "routes.ts"), "export const mine = 1;\n");
    const writer = createRoutesModuleWriter(projectRootAt(dir));

    for (const name of ["a", "b", "c"]) {
      writer.loaded(loadedWith(name, { routes: "routes.ts" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await writer.close();

    const said = warn.mock.calls.flat().join("\n");
    expect(said.match(/holds code Courier did not write/g)).toHaveLength(1);
    expect(readFileSync(join(dir, "routes.ts"), "utf8")).toBe("export const mine = 1;\n");
  });

  it("says why a write failed with no variable's value in it, nor a credential", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubOwnEnvironment(
      { SHOP_TOKEN: "tok_live_4f9c2e7a" },
      "the shop refused tok_live_4f9c2e7a with token=abc123def",
    );
    const config = {
      get sources(): never {
        throw new Error(`the shop refused ${process.env.SHOP_TOKEN} with token=abc123def`);
      },
    } as unknown as CourierConfig;
    const writer = createRoutesModuleWriter(projectRootAt(dir));

    writer.loaded({ config, configFile: join(dir, "courier.config.ts") });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    await writer.close();

    const said = warn.mock.calls.flat().join("\n");
    expect(said).toContain("the shop refused [redacted] with token=[redacted]");
    expect(said).not.toMatch(/tok_live|abc123def/);
  });
});
