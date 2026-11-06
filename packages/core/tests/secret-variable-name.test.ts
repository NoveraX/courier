/**
 * The name a secret's `{ env }` reference gives the variable that holds it,
 * by the one rule Studio's server, its command line, its import wizard and
 * the editor read it with: capitals, digits and `_`, not starting with a
 * digit, 256 characters at most. A credential pasted in a name's place is
 * no name. Values are made up.
 */
import { describe, expect, it } from "vitest";

import { isSecretVariableName } from "../src/config/secret-variable-name";

describe("a secret variable's name", () => {
  it("is written in capitals, digits and _, not starting with a digit", () => {
    for (const name of ["ORDERS_SPEC_TOKEN", "_TOKEN", "A1", "A".repeat(256)]) {
      expect(isSecretVariableName(name)).toBe(true);
    }
  });

  it("is not a value pasted in its place, nor a name in lower case", () => {
    const refused = [
      "sk_live_51HmadeUp9f2c",
      "orders_token",
      "npm_config_cache",
      "__proto__",
      "t0k3n-made-up",
      "1TOKEN",
      "ORDERS TOKEN",
      " ORDERS_TOKEN",
      "",
      "A".repeat(257),
    ];
    for (const name of refused) expect(isSecretVariableName(name)).toBe(false);
  });
});
