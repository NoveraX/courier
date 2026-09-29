/**
 * @vitest-environment node
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findTransformCacheDirectory } from "../src/runtime/transform-cache-directory";

const POSIX = process.platform !== "win32";
const NO_SETTING: Record<string, string | undefined> = {};

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-transform-directory-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

/** Create a directory with exactly `mode`, whatever the umask. */
function directory(path: string, mode = 0o755): string {
  mkdirSync(path, { recursive: true });
  chmodSync(path, mode);
  return path;
}

function transformIn(nodeModules: string): string {
  return join(nodeModules, ".cache", "courier", "transform");
}

/** Every directory from `start` up to the root that holds a `node_modules`. */
function ancestorsWithNodeModules(start: string): string[] {
  const found: string[] = [];
  for (let current = start; ; current = dirname(current)) {
    if (existsSync(join(current, "node_modules"))) found.push(current);
    if (dirname(current) === current) return found;
  }
}

function spyOnDebug() {
  vi.stubEnv("COURIER_LOG_LEVEL", "debug");
  return vi.spyOn(console, "debug").mockImplementation(() => {});
}

describe("findTransformCacheDirectory", () => {
  it("takes .cache/courier/transform in the project's own node_modules", () => {
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"));

    expect(findTransformCacheDirectory(project, NO_SETTING)).toBe(transformIn(nodeModules));
  });

  it("takes the nearest node_modules above a project root that has none", () => {
    directory(join(dir, "node_modules"));
    const workspace = directory(join(dir, "workspace"));
    const nearest = directory(join(workspace, "node_modules"));
    const project = directory(join(workspace, "packages", "app"));

    expect(findTransformCacheDirectory(project, NO_SETTING)).toBe(transformIn(nearest));
  });

  it("passes over a file named node_modules, as module resolution does", () => {
    const nodeModules = directory(join(dir, "node_modules"));
    const project = directory(join(dir, "app"));
    writeFileSync(join(project, "node_modules"), "");

    expect(findTransformCacheDirectory(project, NO_SETTING)).toBe(transformIn(nodeModules));
  });

  it("finds none, and never the temporary directory, when no directory above the project has node_modules", () => {
    const project = directory(join(dir, "app"));

    const found = findTransformCacheDirectory(project, NO_SETTING);

    expect(ancestorsWithNodeModules(project)).toEqual([]);
    expect(found).toBeNull();
  });

  it.each(["0", "false", "off", "OFF", " False "])(
    "finds none when COURIER_TRANSFORM_CACHE is %j",
    (value) => {
      const project = directory(join(dir, "app"));
      directory(join(project, "node_modules"));

      expect(findTransformCacheDirectory(project, { COURIER_TRANSFORM_CACHE: value })).toBeNull();
    },
  );

  it.each(["1", "on", ""])("keeps the directory when COURIER_TRANSFORM_CACHE is %j", (value) => {
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"));

    expect(findTransformCacheDirectory(project, { COURIER_TRANSFORM_CACHE: value })).toBe(
      transformIn(nodeModules),
    );
  });

  it("keeps the directory for a value it does not know, and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"));

    const first = findTransformCacheDirectory(project, { COURIER_TRANSFORM_CACHE: "nope" });
    findTransformCacheDirectory(project, { COURIER_TRANSFORM_CACHE: "nope" });

    expect(first).toBe(transformIn(nodeModules));
    const said = warn.mock.calls.filter((call) => String(call[1]).includes("=nope"));
    expect(said).toHaveLength(1);
    expect(String(said[0]?.[1])).toContain("the transform cache stays on");
  });

  it("reads COURIER_TRANSFORM_CACHE from the process environment by default", () => {
    const project = directory(join(dir, "app"));
    directory(join(project, "node_modules"));
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "off");

    expect(findTransformCacheDirectory(project)).toBeNull();
  });
});

describe.skipIf(!POSIX)("findTransformCacheDirectory on POSIX", () => {
  /** node_modules, then each directory below it down to the one entries go in. */
  const LEVELS = ["node_modules", ".cache", "courier", "transform"] as const;

  /** The path of each level in `project`, from node_modules down. */
  function levelsIn(project: string): string[] {
    let path = project;
    return LEVELS.map((name) => {
      path = join(path, name);
      return path;
    });
  }

  /** The levels only Studio creates, and their index in LEVELS. */
  const STUDIO_LEVELS = [
    ["courier", 2],
    ["transform", 3],
  ] as const;

  it.each(
    STUDIO_LEVELS.flatMap(([name, index]) => [
      [name, "its group", 0o775, index] as const,
      [name, "others", 0o757, index] as const,
    ]),
  )(
    "finds none, and says why at debug level, when %s is writable by %s",
    (_name, _who, mode, index) => {
      const debug = spyOnDebug();
      const project = directory(join(dir, "app"));
      const levels = levelsIn(project);
      for (const level of levels) directory(level);
      const loose = levels[index] ?? "";
      chmodSync(loose, mode);

      const found = findTransformCacheDirectory(project, NO_SETTING);

      expect(found).toBeNull();
      expect(debug).toHaveBeenCalledTimes(1);
      expect(String(debug.mock.calls[0]?.[1])).toContain(
        `${loose} is writable by its group or others`,
      );
    },
  );

  it.each([
    ["node_modules", "its group", 0o775, 0],
    [".cache", "its group", 0o775, 1],
    ["node_modules", "others", 0o757, 0],
  ] as const)(
    "finds the directory when %s is writable by %s, as a package manager may leave it",
    (_name, _who, mode, index) => {
      const debug = spyOnDebug();
      const project = directory(join(dir, "app"));
      const levels = levelsIn(project);
      for (const level of levels.slice(0, 2)) directory(level);
      chmodSync(levels[index] ?? "", mode);

      const found = findTransformCacheDirectory(project, NO_SETTING);

      expect(found).toBe(levels[3]);
      expect(debug).not.toHaveBeenCalled();
    },
  );

  it.each(LEVELS.map((name, index) => [name, index] as const))(
    "finds none when %s is a symbolic link",
    (_name, index) => {
      const debug = spyOnDebug();
      const project = directory(join(dir, "app"));
      const real = directory(join(dir, "real"));
      const levels = levelsIn(project);
      for (const level of levels.slice(0, index)) directory(level);
      const linked = levels[index] ?? "";
      symlinkSync(real, linked);

      const found = findTransformCacheDirectory(project, NO_SETTING);

      expect(found).toBeNull();
      expect(debug).toHaveBeenCalledTimes(1);
      expect(String(debug.mock.calls[0]?.[1])).toContain(`${linked} is a symbolic link`);
    },
  );

  it("finds none when node_modules belongs to another user", () => {
    const debug = spyOnDebug();
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"));
    const uid = process.getuid?.() ?? 0;
    vi.spyOn(process, "getuid").mockReturnValue(uid + 1);

    const found = findTransformCacheDirectory(project, NO_SETTING);

    expect(found).toBeNull();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]?.[1])).toContain(
      `${nodeModules} is owned by uid ${uid}, not ${uid + 1}`,
    );
  });

  it("judges only the directories that exist, and accepts a node_modules only this user can write", () => {
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"), 0o700);

    expect(findTransformCacheDirectory(project, NO_SETTING)).toBe(transformIn(nodeModules));
  });
});

describe("findTransformCacheDirectory looked up on every load", () => {
  const OFF: Record<string, string | undefined> = { COURIER_TRANSFORM_CACHE: "0" };

  it("says once why a project has none, however often it is looked up", () => {
    const debug = spyOnDebug();
    const project = directory(join(dir, "app"));
    directory(join(project, "node_modules"));

    const found = [1, 2, 3].map(() => findTransformCacheDirectory(project, OFF));

    expect(found).toEqual([null, null, null]);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]?.[1])).toContain("COURIER_TRANSFORM_CACHE=0");
  });

  it("says why again when the reason changes", () => {
    const debug = spyOnDebug();
    const project = directory(join(dir, "app"));

    findTransformCacheDirectory(project, OFF);
    findTransformCacheDirectory(project, NO_SETTING);
    findTransformCacheDirectory(project, NO_SETTING);

    expect(debug).toHaveBeenCalledTimes(2);
    expect(String(debug.mock.calls[0]?.[1])).toContain("COURIER_TRANSFORM_CACHE=0");
    expect(String(debug.mock.calls[1]?.[1])).toContain(`no node_modules at or above ${project}`);
  });

  it("says why again when a project that had one has none anew", () => {
    const debug = spyOnDebug();
    const project = directory(join(dir, "app"));
    const nodeModules = directory(join(project, "node_modules"));

    const found = [OFF, NO_SETTING, OFF].map((env) => findTransformCacheDirectory(project, env));

    expect(found).toEqual([null, transformIn(nodeModules), null]);
    expect(debug).toHaveBeenCalledTimes(2);
  });

  it("says why for each project that has none", () => {
    const debug = spyOnDebug();
    const web = directory(join(dir, "web"));
    const api = directory(join(dir, "api"));

    findTransformCacheDirectory(web, OFF);
    findTransformCacheDirectory(api, OFF);

    expect(debug).toHaveBeenCalledTimes(2);
  });
});
