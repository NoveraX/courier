import { describe, expect, it } from "vitest";

import { VARIABLE_NOT_ENCODABLE } from "../../../src/upgrade/migrations/variable-not-encodable";
import { migrateWith } from "./migrate-with";

describe("0.5.0: PROXY_VARIABLE_NOT_SERIALIZABLE", () => {
  it("is named VARIABLE_NOT_ENCODABLE in each string that holds the code alone, in its own quotes", () => {
    const { text, findings } = migrateWith(
      VARIABLE_NOT_ENCODABLE,
      `import { isConfigurationError } from "@noverax/courier";
if (isConfigurationError(error) && error.code === "PROXY_VARIABLE_NOT_SERIALIZABLE") retry();
switch (error.code) { case 'PROXY_VARIABLE_NOT_SERIALIZABLE': break; }
expect(error).toMatchObject({ code: \`PROXY_VARIABLE_NOT_SERIALIZABLE\` });
type Refused = Exclude<ConfigurationErrorCode, "PROXY_VARIABLE_NOT_SERIALIZABLE">;
const tagged = sql\`PROXY_VARIABLE_NOT_SERIALIZABLE\`;
log("PROXY_VARIABLE_NOT_SERIALIZABLE was refused");
`,
    );

    expect(text).toContain('error.code === "VARIABLE_NOT_ENCODABLE"');
    expect(text).toContain("case 'VARIABLE_NOT_ENCODABLE':");
    expect(text).toContain("{ code: `VARIABLE_NOT_ENCODABLE` }");
    expect(text).toContain('Exclude<ConfigurationErrorCode, "VARIABLE_NOT_ENCODABLE">');
    expect(text).toContain("sql`PROXY_VARIABLE_NOT_SERIALIZABLE`");
    expect(text).toContain('log("PROXY_VARIABLE_NOT_SERIALIZABLE was refused")');
    expect(findings).toEqual([]);
  });

  it("is found as a field's name, which code elsewhere may read by that name", () => {
    const { text, findings } = migrateWith(
      VARIABLE_NOT_ENCODABLE,
      `import type { ConfigurationErrorCode } from "@noverax/courier";
const messages = { PROXY_VARIABLE_NOT_SERIALIZABLE: "That cannot be sent" };
const quoted = { "PROXY_VARIABLE_NOT_SERIALIZABLE": "That cannot be sent" };
show(messages.PROXY_VARIABLE_NOT_SERIALIZABLE, quoted["PROXY_VARIABLE_NOT_SERIALIZABLE"]);
`,
    );

    expect(text).not.toContain("VARIABLE_NOT_ENCODABLE");
    expect(findings.map((finding) => [finding.line, finding.instead[0]])).toEqual([
      [2, 'VARIABLE_NOT_ENCODABLE: "That cannot be sent"'],
      [3, '"VARIABLE_NOT_ENCODABLE": "That cannot be sent"'],
      [4, "messages.VARIABLE_NOT_ENCODABLE"],
      [4, 'quoted["VARIABLE_NOT_ENCODABLE"]'],
    ]);
  });
});
