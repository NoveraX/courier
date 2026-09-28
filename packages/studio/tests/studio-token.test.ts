/**
 * The token Studio keeps for a project in `.courier/studio-token`: written
 * once, readable by its owner alone, and the same for every Studio started
 * on the project. A file Studio cannot trust — a link, another account's —
 * is never read or written; that run keeps a token of its own.
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioToken, TOKEN_FILE } from "../src/server/studio-token";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const POSIX = process.platform !== "win32";

let root: string;

function tokenFile(): string {
  return join(root, ".courier", TOKEN_FILE);
}

function warnings(warn: { mock: { calls: unknown[][] } }): string {
  return warn.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-studio-token-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("studioToken", () => {
  it("writes a new token to the project's .courier", () => {
    const token = studioToken(root);

    expect(token.value).toMatch(TOKEN);
    expect(readFileSync(tokenFile(), "utf8")).toBe(`${token.value}\n`);
  });

  it.runIf(POSIX)("lets only its owner read the token file", () => {
    studioToken(root);

    expect(statSync(tokenFile()).mode & 0o777).toBe(0o600);
  });

  it("gives a Studio started again on the project the same token", () => {
    const first = studioToken(root).value;

    expect(studioToken(root).value).toBe(first);
  });

  it("replaces a token file that holds no token", () => {
    mkdirSync(join(root, ".courier"));
    writeFileSync(tokenFile(), "not a token\n", { mode: 0o600 });

    const token = studioToken(root);

    expect(token.value).toMatch(TOKEN);
    expect(readFileSync(tokenFile(), "utf8")).toBe(`${token.value}\n`);
  });

  it.runIf(POSIX)("narrows a token file others can read to its owner", () => {
    const first = studioToken(root).value;
    chmodSync(tokenFile(), 0o644);

    expect(studioToken(root).value).toBe(first);
    expect(statSync(tokenFile()).mode & 0o777).toBe(0o600);
  });

  it.runIf(POSIX)("keeps a token of its own when the token file is a link", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const planted = "p".repeat(43);
    writeFileSync(join(root, "planted"), `${planted}\n`);
    mkdirSync(join(root, ".courier"));
    symlinkSync(join(root, "planted"), tokenFile());

    const token = studioToken(root);

    expect(token.value).toMatch(TOKEN);
    expect(token.value).not.toBe(planted);
    expect(readFileSync(join(root, "planted"), "utf8")).toBe(`${planted}\n`);
    expect(warnings(warn)).toContain("studio-token is not a regular file");
  });

  it.runIf(POSIX)("keeps a token of its own when the token file is another account's", () => {
    const first = studioToken(root).value;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(process, "getuid").mockReturnValue(statSync(tokenFile()).uid + 1);

    const token = studioToken(root);

    expect(token.value).toMatch(TOKEN);
    expect(token.value).not.toBe(first);
    expect(readFileSync(tokenFile(), "utf8")).toBe(`${first}\n`);
    expect(warnings(warn)).toContain("belongs to another account");
  });

  it("keeps a token of its own when .courier cannot hold one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(join(root, ".courier"), "a file, not a directory\n");

    const token = studioToken(root);

    expect(token.value).toMatch(TOKEN);
    expect(warnings(warn)).toContain("could not keep its token");
  });
});

describe("a token's match", () => {
  it("holds for the token itself", () => {
    const token = studioToken(root);

    expect(token.matches(token.value)).toBe(true);
  });

  it("fails for anything else a caller presents", () => {
    const token = studioToken(root);

    expect(token.matches(`${token.value}x`)).toBe(false);
    expect(token.matches(token.value.slice(1))).toBe(false);
    expect(token.matches(token.value.replace(/^./, (c) => (c === "a" ? "b" : "a")))).toBe(false);
    expect(token.matches("")).toBe(false);
    expect(token.matches(undefined)).toBe(false);
    expect(token.matches([token.value])).toBe(false);
  });
});
