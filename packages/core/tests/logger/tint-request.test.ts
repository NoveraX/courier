/**
 * A request line in a terminal: its status in its class's colour, the
 * arrow and the time dimmed, a leading method padded so paths line up —
 * and any other message left as it is.
 */
import { describe, expect, it } from "vitest";

import { tintRequest } from "../../src/logger/tint-request";
import { createTerminalStyle } from "../../src/terminal/terminal-style";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;
const style = createTerminalStyle(4, true);

describe("tintRequest", () => {
  it("colours a status by its class", () => {
    expect(tintRequest("GET /a → 204 (1ms)", style)).toContain("\x1b[32m204\x1b[39m");
    expect(tintRequest("GET /a → 304 (1ms)", style)).toContain("\x1b[33m304\x1b[39m");
    expect(tintRequest("GET /a → 404 (1ms)", style)).toContain("\x1b[31m404\x1b[39m");
    expect(tintRequest("GET /a → 503 (1ms)", style)).toContain("\x1b[35m503\x1b[39m");
    expect(tintRequest("api:users:list → ERROR (8ms)", style)).toContain("\x1b[31mERROR\x1b[39m");
  });

  it("pads a leading method so the paths line up, and changes no other text", () => {
    const get = tintRequest("GET /users → 200 (4ms)", style).replace(ESCAPE, "");
    const remove = tintRequest("DELETE /users/9 → 404 (2ms)", style).replace(ESCAPE, "");

    expect(get).toBe("GET    /users → 200 (4ms)");
    expect(remove).toBe("DELETE /users/9 → 404 (2ms)");
  });

  it("leaves any other message as it is", () => {
    for (const message of [
      "Server stopped",
      "GET /a → soon",
      "Reconnecting in 500ms (attempt 2)",
    ]) {
      expect(tintRequest(message, style)).toBe(message);
    }
  });
});
