/**
 * @vitest-environment node
 *
 * What a load error quotes of the project's own message, and carries as
 * its cause: the environment's values masked and every credential cut,
 * whatever the message holds.
 */

import { REDACTED } from "@noverax/courier/internal";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shownText } from "../../src/config/load-error/shown-text";
import { maskedError, withoutSecrets } from "../../src/config/load-error/without-secrets";
import { seededRandom } from "../helpers/seeded-random";

describe("withoutSecrets", () => {
  it("masks every value of 8 characters or more, one that holds another whole", () => {
    const env = {
      DATABASE_URL: "postgres://u:hunter22@db/app",
      PASSWORD: "hunter22",
      PORT: "5432",
    };

    expect(withoutSecrets("cannot reach postgres://u:hunter22@db/app on 5432", env)).toBe(
      "cannot reach [redacted] on 5432",
    );
    expect(withoutSecrets("wrong password hunter22", env)).toBe("wrong password [redacted]");
  });

  it("leaves the system's own variables, whose values are paths and settings", () => {
    const env = { HOME: "/srv/deploy", PWD: "/srv/deploy/app", LC_ALL: "en_US.UTF-8" };

    expect(withoutSecrets("Cannot find /srv/deploy/app/src/x.ts (en_US.UTF-8)", env)).toBe(
      "Cannot find /srv/deploy/app/src/x.ts (en_US.UTF-8)",
    );
  });

  it("leaves no value of the environment in any message, drawn at random", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789:/@._-";
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const next = seededRandom(seed);
      const word = (length: number) =>
        Array.from({ length }, () => alphabet[next(alphabet.length)]).join("");
      const env: Record<string, string> = {};
      for (let at = 0; at < 1 + next(4); at += 1) env[`SECRET_${at}`] = word(8 + next(24));
      const parts = Object.values(env).flatMap((value) => [word(next(6)), value]);
      const message = parts.join(next(2) === 0 ? " " : "");

      const masked = withoutSecrets(message, env);

      for (const value of Object.values(env)) expect(masked).not.toContain(value);
      expect(masked).toContain(REDACTED);
    }
  });

  it("keeps at most 8192 characters of a long text, as redact() keeps one, and ends it with …", () => {
    const env = { RELEASE_TOKEN: "s3cr3t-value-of-the-release" };
    const text = `${"refused ".repeat(3_000)}s3cr3t-value-of-the-release ${"again ".repeat(10)}`;

    const said = withoutSecrets(text, env);

    expect(said).toHaveLength(8_192);
    expect(said).toBe(`${"refused ".repeat(3_000).slice(0, 8_191)}…`);
  });

  it("reads four times that at most, and says nothing of a text with no word's end in it", () => {
    const text = `${"x".repeat(40_000)} s3cr3t-value-of-the-release`;

    expect(withoutSecrets(text, {})).toBe(`${REDACTED}…`);
  });
});

describe("shownText", () => {
  it("takes the first line, without terminal codes or control characters", () => {
    const esc = String.fromCharCode(27);

    expect(shownText(`${esc}[31mInvalid${esc}[0m env\u0007\nDATABASE_URL: Required`)).toBe(
      "Invalid env",
    );
  });

  it("cuts a long message short, after masking it whole", () => {
    vi.stubEnv("LONG_SECRET", "s3cr3t-value-that-is-long");

    const text = shownText(`${"x".repeat(290)}s3cr3t-value-that-is-long${"y".repeat(50)}`);

    expect(text).not.toContain("s3cr3t");
    expect(text).toHaveLength(301);
    expect(text.endsWith("…")).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("a credential the environment does not hold", () => {
  const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLW9mLWl0";

  it("is closed in a quoted message as the core closes it, with the one sign", () => {
    const said = shownText(
      `upstream refused Bearer ${TOKEN} and postgres://app:hunter2@db.internal/shop with token=abc123def`,
    );

    expect(said).not.toContain(TOKEN);
    expect(said).not.toContain("hunter2");
    expect(said).not.toContain("abc123def");
    expect(said).toContain(REDACTED);
    expect(said).not.toContain("***");
  });

  it("is closed in what the code threw, its stack included", () => {
    const masked = maskedError(new Error(`refused Authorization: Bearer ${TOKEN}`), {});

    expect(masked.message).not.toContain(TOKEN);
    expect(masked.stack).not.toContain(TOKEN);
    expect(masked.message).toContain(REDACTED);
  });

  it("leaves the system's own variables, and words that are no credential", () => {
    const env = { HOME: "/srv/deploy" };

    expect(shownText("Cannot find /srv/deploy/app/src/x.ts")).toBe(
      "Cannot find /srv/deploy/app/src/x.ts",
    );
    expect(withoutSecrets("Cannot find /srv/deploy/app/src/x.ts", env)).toBe(
      "Cannot find /srv/deploy/app/src/x.ts",
    );
  });
});

describe("maskedError", () => {
  it("keeps the thrown error's name and code, its message and stack masked", () => {
    const thrown = Object.assign(new TypeError("bad tok_live_4f9c2e7a here"), { code: "E_BAD" });

    const masked = maskedError(thrown, { TOKEN: "tok_live_4f9c2e7a" });

    expect(masked.name).toBe("TypeError");
    expect(masked.message).toBe("bad [redacted] here");
    expect(masked.stack).not.toContain("tok_live");
    expect(Reflect.get(masked, "code")).toBe("E_BAD");
  });

  it("makes an error of a value thrown that is none", () => {
    expect(maskedError("refused tok_live_4f9c2e7a", { TOKEN: "tok_live_4f9c2e7a" }).message).toBe(
      "refused [redacted]",
    );
  });
});

describe("the forms a value takes in a message", () => {
  /* A key in PEM, as a multi-line variable holds one; every value here is made up. */
  const PEM =
    "-----BEGIN PROBE KEY-----\nAAAABBBBCCCCDDDDEEEE\nFFFFGGGGHHHHIIIIJJJJ\n-----END PROBE KEY-----";

  it("masks a value escaped in JSON, as a message that writes its settings out holds it", () => {
    const said = withoutSecrets(`bad config ${JSON.stringify({ key: PEM })}`, { KEY: PEM });

    expect(said).toBe(`bad config {"key":"${REDACTED}"}`);
  });

  it("masks a value encoded for an address", () => {
    const key = "pr0be+k3y/v4lue=";

    expect(
      withoutSecrets(`GET https://api.invalid/?k=${encodeURIComponent(key)} failed`, {
        KEY: key,
      }),
    ).toBe(`GET https://api.invalid/?k=${REDACTED} failed`);
  });

  it("masks a value trimmed, as code that read it from a CRLF file or quotes with spaces has it", () => {
    const env = { CRLF: "s3cr3t-v4lue-0000\r", QUOTED: "  padded-s3cr3t  " };

    expect(withoutSecrets("tried s3cr3t-v4lue-0000 and padded-s3cr3t", env)).toBe(
      `tried ${REDACTED} and ${REDACTED}`,
    );
  });

  it("masks each line of a value of several, wherever a line stands alone", () => {
    const said = withoutSecrets("line AAAABBBBCCCCDDDDEEEE, then FFFFGGGGHHHHIIIIJJJJ", {
      KEY: PEM,
    });

    expect(said).toBe(`line ${REDACTED}, then ${REDACTED}`);
  });

  it("leaves a form shorter than 8 characters, as it leaves a value that short", () => {
    const env = { KEY: "abc\ndefghijk" };

    expect(withoutSecrets("abc and defghijk", env)).toBe(`abc and ${REDACTED}`);
  });

  it("masks a value in a quoted message before its control characters are taken out", () => {
    vi.stubEnv("BELL_KEY", "abc\u0007defghij");

    expect(shownText("refused abc\u0007defghij, try again")).toBe(`refused ${REDACTED}, try again`);
    vi.unstubAllEnvs();
  });

  it("masks a value that spans lines in a quoted message, whose first line alone is shown", () => {
    vi.stubEnv("PROBE_PEM", PEM);

    expect(shownText(`bad key ${PEM} given`)).toBe(`bad key ${REDACTED} given`);
    vi.unstubAllEnvs();
  });
});

describe("a variable that names a place", () => {
  const PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

  afterEach(() => {
    if (PLATFORM !== undefined) Object.defineProperty(process, "platform", PLATFORM);
  });

  /* A test of how a system reads a name or a path runs on that system, whichever the runner is. */
  function on(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { ...PLATFORM, value: platform });
  }

  it("is left alone on POSIX where its value is an absolute path, or a list of them", () => {
    on("linux");
    const env = {
      RUNNER_TEMP: "/home/runner/work/_temp",
      NPM_CONFIG_USERCONFIG: "/home/runner/work/_temp/.npmrc",
      NODE_PATH: "/usr/lib/node_modules:/usr/local/lib/node_modules",
    };
    const said = `reading /home/runner/work/_temp/.npmrc for /home/runner/work/_temp/x/api.ts from ${env.NODE_PATH}`;

    expect(withoutSecrets(said, env)).toBe(said);
  });

  it("is left alone on Windows, a path written with either separator and a system name in any case", () => {
    on("win32");
    const env = {
      USERPROFILE: "C:\\Users\\ana",
      HOMEPATH: "\\Users\\ana",
      APPDATA: "C:\\Users\\ana\\AppData\\Roaming",
      ProgramData: "C:/ProgramData",
      RUNNER_TEMP: "D:\\a\\_temp",
      PSModulePath:
        "C:\\Program Files\\PowerShell\\Modules;C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules",
      ComputerName: "fv-az1234-567",
      PathExt: ".COM;.EXE;.BAT;.CMD",
    };
    const said =
      "reading C:\\Users\\ana\\.npmrc for D:\\a\\_temp\\x\\api.ts on fv-az1234-567, which runs .COM;.EXE;.BAT;.CMD";

    expect(withoutSecrets(said, env)).toBe(said);
  });

  it("is masked where the path holds a key, or the variable's name says it holds a secret", () => {
    /* A key in base64 that starts with `/`, a token in a webhook's path, and a path under a
       name that gives it away; every value here is made up. */
    const env = {
      SEED: "/Xq9+kZ2mL7vB4nR8wY1cE5tH0jU6oP3sA=",
      WEBHOOK_PATH: "/hooks/inbound/9f8a7c6b5e4d3c2b1a0f7e6d",
      RELEASE_SIGNING_SECRET: "/srv/keys/release",
    };
    const said = `tried ${env.SEED}, ${env.WEBHOOK_PATH} and ${env.RELEASE_SIGNING_SECRET}`;

    expect(withoutSecrets(said, env)).toBe(`tried ${REDACTED}, ${REDACTED} and ${REDACTED}`);
  });

  it("is read past the folders the system's own variables name, which it may name at random", () => {
    /* A temporary folder named at random, as macOS names a user's. */
    const temp = "/tmp/build-4f9c2e7a1b3d5f6e8a0c";
    const env = {
      TMPDIR: `${temp}/`,
      NODE_COMPILE_CACHE: `${temp}/node-compile-cache`,
      UPLOADS: `${temp}/9f8a7c6b5e4d3c2b1a0f7e6d`,
    };

    expect(withoutSecrets(`cache ${env.NODE_COMPILE_CACHE}, uploads ${env.UPLOADS}`, env)).toBe(
      `cache ${env.NODE_COMPILE_CACHE}, uploads ${REDACTED}`,
    );
  });

  it("is masked where a system variable's name says it holds a secret", () => {
    /* npm's `_auth`, a user and a password in base64; made up. */
    const env = { npm_config__auth: "YW5hOnMzY3IzdC1wNHNz" };

    expect(withoutSecrets(`npm refused ${env.npm_config__auth}`, env)).toBe(
      `npm refused ${REDACTED}`,
    );
  });

  it("is masked on POSIX where its name only reads as a system name's in another case", () => {
    on("linux");
    expect(withoutSecrets("signed in as runneradmin", { UserName: "runneradmin" })).toBe(
      `signed in as ${REDACTED}`,
    );
  });
});

describe("a value of the environment where a credential stands", () => {
  /* GitHub's Windows runner sets PGUSER=postgres: 8 characters, no system's variable. */
  const RUNNER = { PGUSER: "postgres" };

  it("leaves the credential to the core's rules, as they read the text the code wrote", () => {
    expect(withoutSecrets("cannot reach postgres://app:hunter2@db.internal/shop", RUNNER)).toBe(
      `cannot reach ${REDACTED}://db.internal/shop`,
    );
  });

  it("is masked in a quoted message, its credential cut", () => {
    vi.stubEnv("PGUSER", "postgres");

    const said = shownText(
      "upstream refused postgres://app:hunter2@db.internal/shop with token=abc123def",
    );

    expect(said).toBe(`upstream refused ${REDACTED}://db.internal/shop with token=${REDACTED}`);
    vi.unstubAllEnvs();
  });

  it("is masked in what the code threw, its credential cut in the stack too", () => {
    const masked = maskedError(
      new Error("cannot reach postgres://app:hunter2@db.internal/shop"),
      RUNNER,
    );

    expect(masked.message).toBe(`cannot reach ${REDACTED}://db.internal/shop`);
    expect(masked.stack).not.toContain("hunter2");
    expect(masked.stack).not.toContain("postgres");
  });

  it("is masked whole where it is the address, the credential in it with it", () => {
    const env = { DATABASE_URL: "postgres://app:hunter2@db.internal/shop" };

    expect(withoutSecrets("cannot reach postgres://app:hunter2@db.internal/shop", env)).toBe(
      `cannot reach ${REDACTED}`,
    );
  });

  it("is masked whole where a credential's rule cuts only its first word", () => {
    const env = { DB_PASSPHRASE: "correct horse battery staple" };

    expect(withoutSecrets("login refused: password=correct horse battery staple", env)).toBe(
      `login refused: password=${REDACTED}`,
    );
  });

  it("is masked whole where another value overlaps it", () => {
    const env = { FIRST_KEY: "alpha123beta456", SECOND_KEY: "beta456gamma789" };

    expect(withoutSecrets("tried alpha123beta456gamma789", env)).toBe(`tried ${REDACTED}`);
  });
});
