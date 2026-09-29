import { describe, expect, it } from "vitest";

import { specHostMatches } from "../src/server/spec-host-matches";

describe("specHostMatches", () => {
  it.each([
    ["gitlab.internal", "https://gitlab.internal/spec.json", true],
    ["GitLab.Internal", "https://gitlab.internal/spec.json", true],
    ["gitlab.internal:443", "https://gitlab.internal/spec.json", true],
    ["gitlab.internal:8443", "https://gitlab.internal/spec.json", false],
    ["fd00::1", "http://[fd00::1]:8080/spec.json", true],
    ["[fd00::1]:8080", "http://[fd00::1]:8080/spec.json", true],
    ["bücher.example", "http://bücher.example/spec.json", true],
    ["bücher.example:8080", "http://bücher.example:8080/spec.json", true],
    ["bücher.example", "http://buecher.example/spec.json", false],
  ])("%s against %s: %s", (entry, url, matches) => {
    expect(specHostMatches(entry, new URL(url))).toBe(matches);
  });
});
