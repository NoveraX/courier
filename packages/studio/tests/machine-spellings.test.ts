/**
 * A directory goes by more than one name on a machine — through a link, as
 * the disk stores its letter case, by Windows' 8.3 short name — and a text
 * may use any of them; each is taken off as the directory is.
 */
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { pathScrubber } from "../src/server/machine-paths";
import { type Machine, machineSpellings } from "../src/server/machine-spellings";
import type { PathStyle } from "../src/server/path-style";

const LINUX: PathStyle = { windows: false, caseless: false };
const MACOS: PathStyle = { windows: false, caseless: true };
const WINDOWS: PathStyle = { windows: true, caseless: true };

function machine(
  style: PathStyle,
  dirs: { home: string; temp: string },
  links: Record<string, string>,
): Machine {
  return {
    home: () => dirs.home,
    temp: () => dirs.temp,
    realpath: (path) => links[path] ?? path,
    style,
  };
}

describe("machineSpellings", () => {
  it("knows the project and the home directory by where their links lead too", () => {
    const freebsd = machine(
      LINUX,
      { home: "/home/ana", temp: "/tmp" },
      { "/home/ana": "/usr/home/ana", "/home/ana/shop": "/usr/home/ana/shop" },
    );

    const paths = machineSpellings({ project: ["/home/ana/shop"] }, freebsd);
    const shown = pathScrubber(paths, LINUX);

    expect(paths).toEqual({
      project: ["/home/ana/shop", "/usr/home/ana/shop"],
      home: ["/home/ana", "/usr/home/ana"],
      temp: ["/tmp"],
    });
    expect(shown("Cannot find module '/usr/home/ana/.npm/_npx/1/x.js'")).toBe(
      "Cannot find module '~/.npm/_npx/1/x.js'",
    );
    expect(shown("open /usr/home/ana/shop/src/a.ts")).toBe("open src/a.ts");
  });

  it("knows macOS' temporary directory by its /private name, outside the home directory", () => {
    const macos = machine(
      MACOS,
      { home: "/Users/ana", temp: "/var/folders/ab/cd/T" },
      { "/var/folders/ab/cd/T": "/private/var/folders/ab/cd/T" },
    );

    const shown = pathScrubber(machineSpellings({ project: [] }, macos), MACOS);

    expect(shown("open /private/var/folders/ab/cd/T/x.ts, /var/folders/ab/cd/T/y.ts")).toBe(
      "open <temp>/x.ts, <temp>/y.ts",
    );
  });

  it("knows the home directory by the 8.3 name Windows' temporary directory gives away", () => {
    const windows = machine(
      WINDOWS,
      { home: "C:\\Users\\Ana Maria", temp: "C:\\Users\\ANAMAR~1\\AppData\\Local\\Temp" },
      { "C:\\Users\\ANAMAR~1\\AppData\\Local\\Temp": "C:\\Users\\Ana Maria\\AppData\\Local\\Temp" },
    );

    const paths = machineSpellings({ project: [] }, windows);
    const shown = pathScrubber(paths, WINDOWS);

    expect(paths.home).toEqual(["C:\\Users\\Ana Maria", "C:\\Users\\ANAMAR~1"]);
    expect(paths.temp).toEqual([]);
    expect(shown("open C:\\Users\\ANAMAR~1\\AppData\\Local\\Temp\\courier-1\\x.ts")).toBe(
      "open ~/AppData/Local/Temp/courier-1/x.ts",
    );
    expect(shown("open 'C:\\Users\\ANAMAR~1\\Documents\\y.ts'")).toBe("open '~/Documents/y.ts'");
  });

  it("adds no short name when the temporary directory's names differ elsewhere than the home directory", () => {
    const windows = machine(
      WINDOWS,
      { home: "C:\\Users\\ana", temp: "C:\\Users\\ana\\APPDAT~1\\Local\\Temp" },
      { "C:\\Users\\ana\\APPDAT~1\\Local\\Temp": "C:\\Users\\ana\\AppData\\Local\\Temp" },
    );

    const paths = machineSpellings({ project: [] }, windows);

    expect(paths.home).toEqual(["C:\\Users\\ana"]);
    expect(pathScrubber(paths, WINDOWS)("open C:\\Users\\ana\\APPDAT~1\\Local\\Temp\\x")).toBe(
      "open ~/APPDAT~1/Local/Temp/x",
    );
  });

  it("takes the home and temporary directories given over the machine's", () => {
    const linux = machine(LINUX, { home: "/home/ana", temp: "/tmp" }, {});

    expect(machineSpellings({ project: [], home: "/srv/ana", temp: [] }, linux)).toEqual({
      project: [],
      home: ["/srv/ana"],
      temp: [],
    });
  });

  it("names this machine's home and temporary directories by default", () => {
    const shown = pathScrubber(machineSpellings({ project: [] }));

    expect(shown(`open ${join(homedir(), ".npmrc")}`)).toBe("open ~/.npmrc");
    expect(shown(`open ${join(tmpdir(), "x.ts")}`)).toMatch(/^open (<temp>|~)\/.*x\.ts$/);
  });
});
