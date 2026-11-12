/**
 * A word goes into a shell command as it is only when no shell reads
 * anything in it, and between single quotes otherwise. zsh, the shell a
 * Mac opens, puts a command's path in place of a word that starts with
 * `=`, and with magic_equal_subst set, in place of what follows one inside
 * a word. The values are made up; nothing is run.
 */
import { describe, expect, it } from "vitest";
import { shellWord } from "@/lib/snippet-values";
import { shellRead } from "./shell-read";

describe("a word of a shell command", () => {
  it("goes as it is when no shell reads anything in it", () => {
    for (const word of ["POST", "x-note", "a.b/c:d", "50%", "a,b+c", "@file"]) {
      expect(shellWord(word)).toBe(word);
    }
  });

  it.each(["=PLAIN", "a==PLAIN", "LIST|ALL", "a b", "it's", "~", "$HOME", "*"])(
    "goes between single quotes when a shell reads something in %s, and keeps its text",
    (word) => {
      const written = shellWord(word);
      expect(written.startsWith("'")).toBe(true);
      expect(shellRead(written).words).toEqual([word]);
    },
  );
});
