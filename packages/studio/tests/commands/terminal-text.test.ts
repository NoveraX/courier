/**
 * What a command prints of a specification's text is shown, never acted
 * on: a character a terminal acts on — a control, a line or paragraph
 * separator, a bidirectional override — is written as its escape, and
 * every other character, a letter of any script among them, as it is.
 */
import { describe, expect, it } from "vitest";

import { terminalText } from "../../src/commands/terminal-text";

describe("terminalText", () => {
  it("escapes the C0 and C1 controls and DEL", () => {
    expect(terminalText("a\u001b[2Jb\u0007c\u009bd\u007fe\nf")).toBe(
      "a\\u001b[2Jb\\u0007c\\u009bd\\u007fe\\u000af",
    );
  });

  it("escapes the line and paragraph separators and the bidirectional controls", () => {
    expect(terminalText("x y z‮w⁦v⁩")).toBe("x\\u2028y\\u2029z\\u202ew\\u2066v\\u2069");
  });

  it("leaves every other character as it is", () => {
    expect(terminalText("/api/users/{id} — as written")).toBe("/api/users/{id} — as written");
  });
});
