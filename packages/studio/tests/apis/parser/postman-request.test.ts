/**
 * What a Postman request turns into, checked by calling the generated client
 * against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/load-generated";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

let server: RecordingServer;

beforeAll(async () => {
  server = await startRecordingServer(() => ({ contentType: "application/json", body: "{}" }));
});

afterAll(async () => {
  await server.close();
});

function collection(item: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    info: {
      name: "Acme",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [{ name: "Users", item }],
    ...extra,
  });
}

function call(spec: string, name: string) {
  const files = generateCode(parseSpec(spec), { type: "postman", outputDir: "src" }, "acme");
  return generatedCall(loadGenerated(files, "src/acme/index.ts"), ["acmeApi", "users", name]);
}

describe("a Postman parameter named with a hyphen", () => {
  it("is sent under its own name in the query, and fills its path segment", async () => {
    const spec = collection([
      {
        name: "List posts",
        request: {
          method: "GET",
          url: {
            raw: `${server.url}/users/:user-id/posts?per-page=10`,
            host: [server.url],
            path: ["users", ":user-id", "posts"],
            query: [{ key: "per-page", value: "10" }],
          },
        },
      },
    ]);

    await call(spec, "listPosts")({ user_id: "u1", "per-page": 10 });

    expect(server.requests.at(-1)).toMatchObject({
      path: "/users/u1/posts",
      query: [["per-page", "10"]],
    });
  });
});
