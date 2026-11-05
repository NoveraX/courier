/**
 * @vitest-environment node
 *
 * What a load error quotes of the project's own message, and carries as
 * its cause: the environment's values masked, whatever the message holds.
 */
import { describe, expect, it, vi } from "vitest";

import {
  MASKED,
  maskEnvironmentValues,
  maskedError,
} from "../../src/config/load-error/mask-env-values";
import { shownText } from "../../src/config/load-error/shown-text";
import { seededRandom } from "../helpers/seeded-random";

describe("maskEnvironmentValues", () => {
  it("masks every value of 8 characters or more, the longest first", () => {
    const env = {
      DATABASE_URL: "postgres://u:hunter22@db/app",
      PASSWORD: "hunter22",
      PORT: "5432",
    };

    expect(maskEnvironmentValues("cannot reach postgres://u:hunter22@db/app on 5432", env)).toBe(
      "cannot reach *** on 5432",
    );
    expect(maskEnvironmentValues("wrong password hunter22", env)).toBe("wrong password ***");
  });

  it("leaves the system's own variables, whose values are paths and settings", () => {
    const env = { HOME: "/srv/deploy", PWD: "/srv/deploy/app", LC_ALL: "en_US.UTF-8" };

    expect(maskEnvironmentValues("Cannot find /srv/deploy/app/src/x.ts (en_US.UTF-8)", env)).toBe(
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

      const masked = maskEnvironmentValues(message, env);

      for (const value of Object.values(env)) expect(masked).not.toContain(value);
      expect(masked).toContain(MASKED);
    }
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

describe("maskedError", () => {
  it("keeps the thrown error's name and code, its message and stack masked", () => {
    const thrown = Object.assign(new TypeError("bad tok_live_4f9c2e7a here"), { code: "E_BAD" });

    const masked = maskedError(thrown, { TOKEN: "tok_live_4f9c2e7a" });

    expect(masked.name).toBe("TypeError");
    expect(masked.message).toBe("bad *** here");
    expect(masked.stack).not.toContain("tok_live");
    expect(Reflect.get(masked, "code")).toBe("E_BAD");
  });

  it("makes an error of a value thrown that is none", () => {
    expect(maskedError("refused tok_live_4f9c2e7a", { TOKEN: "tok_live_4f9c2e7a" }).message).toBe(
      "refused ***",
    );
  });
});
