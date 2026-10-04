/**
 * One log line as JSON: ISO time, level, scope, process id, message, and an
 * error only when there is one.
 */
import { describe, expect, it } from "vitest";

import { jsonLine } from "../../src/logger/json-line";

describe("jsonLine", () => {
  it("writes the time in ISO 8601, the level, the scope and the message on one line", () => {
    const line = jsonLine("info", "MockServer", "GET /users → 200 (4ms)\nsecond line");

    expect(line).not.toContain("\n");
    const record: unknown = JSON.parse(line);
    expect(record).toEqual({
      time: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      level: "info",
      scope: "mock-server",
      pid: process.pid,
      message: "GET /users → 200 (4ms)\nsecond line",
    });
  });

  it("carries the error behind the line, and none for null", () => {
    expect(JSON.parse(jsonLine("error", "Studio", "failed", new Error("disk full")))).toMatchObject(
      {
        error: { name: "Error", message: "disk full" },
      },
    );
    expect(JSON.parse(jsonLine("error", "Studio", "failed", null))).not.toHaveProperty("error");
  });
});
