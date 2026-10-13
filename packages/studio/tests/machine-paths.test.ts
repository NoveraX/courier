/**
 * A text names no directory of the machine as it is there: a path in the
 * project is named relative to it, any other under the home directory from
 * `~` and under the temporary directory from `<temp>` — wherever the text
 * puts the path, however the platform spells it.
 */
import { describe, expect, it } from "vitest";

import { pathScrubber } from "../src/server/machine-paths";
import type { PathStyle } from "../src/server/path-style";

const LINUX: PathStyle = { windows: false, caseless: false };
const MACOS: PathStyle = { windows: false, caseless: true };
const WINDOWS: PathStyle = { windows: true, caseless: true };

const POSIX_PATHS = {
  project: ["/Users/ana/work/shop", "/private/var/shop-link"],
  home: "/Users/ana",
  temp: ["/var/folders/ab/cd/T", "/private/var/folders/ab/cd/T"],
};

describe("pathScrubber on macOS and Linux", () => {
  const shown = pathScrubber(POSIX_PATHS, MACOS);

  it.each([
    [
      "ENOENT: no such file or directory, realpath '/Users/ana/work/shop/dangling'",
      "ENOENT: no such file or directory, realpath 'dangling'",
    ],
    ["open /Users/ana/work/shop/specs/x.yaml", "open specs/x.yaml"],
    ["at load (/Users/ana/work/shop/src/api.ts:3:7)", "at load (src/api.ts:3:7)"],
    ["read /private/var/shop-link/a.ts", "read a.ts"],
    ["Cannot find module '/Users/ana/.npm/_npx/1/x.js'", "Cannot find module '~/.npm/_npx/1/x.js'"],
    ["beside it, /Users/ana/work/shop-other/x.ts", "beside it, ~/work/shop-other/x.ts"],
    ["open /var/folders/ab/cd/T/x.ts", "open <temp>/x.ts"],
    ["open /private/var/folders/ab/cd/T/courier-1/x.ts", "open <temp>/courier-1/x.ts"],
  ])("names %s from the directory it lies in", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it.each([
    [
      "There is no courier.config in /Users/ana/work/shop.",
      "There is no courier.config in the project root.",
    ],
    ["in /Users/ana/work/shop, so", "in the project root, so"],
    ["in /Users/ana/work/shop; create it", "in the project root; create it"],
    ["is it /Users/ana/work/shop?", "is it the project root?"],
    ["scandir '/Users/ana/work/shop'", "scandir 'the project root'"],
    ["home is /Users/ana", "home is ~"],
    ["(/Users/ana)", "(~)"],
    ["temp is /var/folders/ab/cd/T.", "temp is <temp>."],
  ])("names the directory itself in %s", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it.each([
    ["Cannot find module `/Users/ana/work/shop/x.ts`", "Cannot find module `x.ts`"],
    ["<path>/Users/ana/work/shop/x.ts</path>", "<path>x.ts</path>"],
    ["a|/Users/ana/work/shop/x.ts", "a|x.ts"],
    ["a;/Users/ana/work/shop/x.ts", "a;x.ts"],
    ["{/Users/ana/work/shop/x.ts}", "{x.ts}"],
    ["pkg@/Users/ana/work/shop/x.ts", "pkg@x.ts"],
    ["#/Users/ana/work/shop/x.ts", "#x.ts"],
    ["→/Users/ana/work/shop/x.ts", "→x.ts"],
    ["path=/Users/ana/work/shop/x.ts", "path=x.ts"],
    ["open\n/Users/ana/work/shop/x.ts", "open\nx.ts"],
  ])("finds a path after any delimiter: %s", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it.each([
    ["    at file:///Users/ana/work/shop/src/a.ts:3:7", "    at src/a.ts:3:7"],
    ["file://localhost/Users/ana/work/shop/x.ts", "x.ts"],
    ["file:/Users/ana/work/shop/x.ts", "x.ts"],
    ["import 'file:///Users/ana/.config/x.js'", "import '~/.config/x.js'"],
  ])("takes a file: URL with the path it holds: %s", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it("finds a name a file: URL escapes, and one in either Unicode normal form", () => {
    const named = pathScrubber({ project: [], home: "/Users/Ana Jos\u00e9" }, MACOS);

    expect(named("at file:///Users/Ana%20Jos%C3%A9/x.ts:1:1")).toBe("at ~/x.ts:1:1");
    expect(named("open '/Users/Ana Jose\u0301/x'")).toBe("open '~/x'");
  });

  it("ignores letter case where the platform does, and only there", () => {
    expect(shown("open '/users/ANA/work/shop/x.ts'")).toBe("open 'x.ts'");
    expect(pathScrubber(POSIX_PATHS, LINUX)("open '/users/ana/x.ts'")).toBe(
      "open '/users/ana/x.ts'",
    );
  });

  it.each([
    ["cannot read /Users/ana\\n next line", "cannot read ~\\n next line"],
    ["HOME=/Users/ana=", "HOME=~="],
    ["/Users/ana#anchor", "~#anchor"],
    ["/Users/ana@1.2.3", "~@1.2.3"],
    ["/Users/ana%2Fx", "~%2Fx"],
    ["home is /Users/ana…", "home is ~…"],
    ["/Users/ana!x", "~!x"],
    ["[warn]/Users/ana/x.ts", "[warn]~/x.ts"],
  ])(
    "names the directory itself before what does not go on with its name: %s",
    (text, expected) => {
      expect(shown(text)).toBe(expected);
    },
  );

  it("finds a directory named alone in JSON-escaped text, and keeps the escape after it", () => {
    const text = JSON.stringify({
      error: 'cannot read "/Users/ana"',
      in: '"/Users/ana/work/shop"',
    });

    expect(shown(text)).toBe(String.raw`{"error":"cannot read \"~\"","in":"\"the project root\""}`);
    expect(JSON.parse(shown(text))).toEqual({
      error: 'cannot read "~"',
      in: '"the project root"',
    });
  });

  it.each([
    "/Users/anastasia/x.ts",
    "/Users/ana.bak/x",
    "/Users/ana%20bak/x",
    `/Users/ana${String.fromCodePoint(0x301)}/x`,
    "/srv/Users/ana/work/shop/x.ts",
    "https://example.com/Users/ana/work/shop/x.ts",
    "https://[::1]/Users/ana/work/shop/x.ts",
    "http://[fe80::1%25en0]:6280/Users/ana/x",
    "https://ana@[::1]/Users/ana/x",
    "~/Users/ana/x.ts",
    "./Users/ana/x.ts",
    "/private/tmp/report.txt",
    "%2FUsers%2Fana%2Fx",
  ])("leaves %s whole: it is not under those directories", (text) => {
    expect(shown(text)).toBe(text);
  });

  it("names a path by the deepest directory it lies in, whichever is given first", () => {
    const nested = pathScrubber(
      {
        project: ["/var/folders/ab/cd/T/courier-1"],
        home: "/Users/ana",
        temp: "/var/folders/ab/cd/T",
      },
      MACOS,
    );

    expect(nested("open /var/folders/ab/cd/T/courier-1/x.ts and /var/folders/ab/cd/T/y")).toBe(
      "open x.ts and <temp>/y",
    );
  });

  it("never takes a file system's root off, which would name every path", () => {
    expect(pathScrubber({ project: ["/"], home: "/" }, LINUX)("open /etc/hosts")).toBe(
      "open /etc/hosts",
    );
  });
});

describe("pathScrubber on Windows, on any platform", () => {
  const shown = pathScrubber(
    {
      project: ["C:\\Users\\ana\\work\\shop"],
      home: ["C:\\Users\\ana", "C:\\Users\\ANA~1"],
      temp: "D:\\Temp",
    },
    WINDOWS,
  );

  it.each([
    ["open 'C:\\Users\\ana\\work\\shop\\specs\\x.yaml'", "open 'specs/x.yaml'"],
    ["open C:/Users/ana/work/shop/specs/x.yaml", "open specs/x.yaml"],
    ["open c:\\users\\ANA\\work\\shop\\x.ts", "open x.ts"],
    ["    at load (C:\\Users\\ana\\work\\shop\\src\\api.ts:3:7)", "    at load (src/api.ts:3:7)"],
    ["    at file:///C:/Users/ana/work/shop/courier.config.ts:3:7", "    at courier.config.ts:3:7"],
    ["at file://localhost/C:/Users/ana/work/shop/x.ts:1:1", "at x.ts:1:1"],
    [
      "Cannot find module 'file:///C:/Users/ana/AppData/x.js'",
      "Cannot find module '~/AppData/x.js'",
    ],
    ["open '\\\\?\\C:\\Users\\ana\\work\\shop\\x.ts'", "open 'x.ts'"],
    ["open 'C:\\Users\\ANA~1\\AppData\\Local\\Temp\\x.ts'", "open '~/AppData/Local/Temp/x.ts'"],
    ["open D:\\Temp\\courier-1\\x.ts", "open <temp>/courier-1/x.ts"],
    [
      "There is no courier.config in C:\\Users\\ana\\work\\shop, so",
      "There is no courier.config in the project root, so",
    ],
    ["open 'C:\\Users\\ana\\work\\shop-other'", "open '~/work/shop-other'"],
  ])("names %s from the directory it lies in", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it("finds a path JSON escaped inside a text, and keeps the escape of a quote after it", () => {
    expect(
      shown('Studio refused "C:\\\\Users\\\\ana\\\\work\\\\shop\\\\x.ts": it is a link.'),
    ).toBe('Studio refused "x.ts": it is a link.');
    expect(shown('"\\\\\\\\?\\\\C:\\\\Users\\\\ana\\\\x.ts"')).toBe('"~/x.ts"');
    expect(shown('{"error":"open \\"C:\\\\Users\\\\ana\\\\x.ts\\""}')).toBe(
      '{"error":"open \\"~/x.ts\\""}',
    );
  });

  it.each([
    [{ error: 'cannot read "C:\\Users\\ana"' }, { error: 'cannot read "~"' }],
    [
      { error: 'cannot read "C:\\Users\\ana\\work\\shop"' },
      { error: 'cannot read "the project root"' },
    ],
    [{ error: 'cannot read "C:\\Users\\ana\\x.ts"' }, { error: 'cannot read "~/x.ts"' }],
    [{ error: "C:\\Users\\ana\\" }, { error: "~" }],
    [{ error: "C:\\Users\\ana\nnext line" }, { error: "~\nnext line" }],
    [{ error: "C:\\Users\\ana\\x.ts\n\tat y" }, { error: "~/x.ts\n\tat y" }],
    [{ error: "C:\\Users\\ana\\a\\\nb" }, { error: "~/a/\nb" }],
  ])("keeps JSON whole around a path it escapes, as text: %j", (value, expected) => {
    expect(JSON.parse(shown(JSON.stringify(value)))).toEqual(expected);
  });

  it("takes a lone backslash for a separator in text JSON did not escape", () => {
    expect(shown("open C:\\Users\\ana\\node_modules\\x")).toBe("open ~/node_modules/x");
  });

  it("reads a run of backslashes after the directory once, however long", () => {
    const text = `C:\\Users\\ana${"\\".repeat(200_000)}`;
    const started = performance.now();

    const named = shown(text);

    expect(performance.now() - started).toBeLessThan(1_000);
    expect(named).toMatch(/^~\/\\+$/);
  });

  it("finds a name a file: URL escapes", () => {
    const spaced = pathScrubber({ project: [], home: "C:\\Users\\Ana Maria" }, WINDOWS);

    expect(spaced("at file:///C:/Users/Ana%20Maria/shop/x.ts:1:1")).toBe("at ~/shop/x.ts:1:1");
  });

  it.each([
    "open 'D:\\Users\\ana\\x'",
    "C:\\Users\\anastasia\\x",
    "https://example.com/C:/Users/ana/x",
  ])("leaves %s whole: it is not under those directories", (text) => {
    expect(shown(text)).toBe(text);
  });

  it("never takes a drive's root off", () => {
    expect(pathScrubber({ project: ["C:\\"] }, WINDOWS)("open C:\\Windows\\x")).toBe(
      "open C:\\Windows\\x",
    );
  });
});
