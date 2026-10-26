/**
 * Where the recorder says a call went, for the fixture it writes: the
 * endpoint's path with each parameter filled — a `{+name}` with its slashes
 * as the client sends them — and a parameter the call gave no value for
 * left as the path writes it.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createRecordingTransport } from "../../src/record/recording-transport";

const { endpoint } = courier();

const google = defineApi({
  baseURL: "https://api.example",
  groups: {
    operations: defineGroup({
      prefix: "v1",
      endpoints: {
        cancel: endpoint.post("{+name}::cancel").variables<{ name: string }>(),
        file: endpoint.get("files/{id}abc").variables<{ id: string }>(),
      },
    }),
  },
});

describe("the address the recorder writes down", () => {
  const transport = createRecordingTransport({ source: google });

  it("sends a {+name} value's slashes as written, each part encoded", () => {
    expect(
      transport.describe("operations", "cancel", { name: "projects/p 1/operations/o" }),
    ).toEqual({
      method: "POST",
      url: "https://api.example/v1/projects/p%201/operations/o:cancel",
    });
  });

  it("leaves a parameter given no value as the path writes it", () => {
    expect(transport.describe("operations", "file", {})).toEqual({
      method: "GET",
      url: "https://api.example/v1/files/{id}abc",
    });
    expect(transport.describe("operations", "cancel", {}).url).toBe(
      "https://api.example/v1/{+name}:cancel",
    );
  });
});
