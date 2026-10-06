/**
 * A request body written inline in the specification — an object's fields,
 * no named schema — gets a schema of its own, which checks what the call
 * is made with before it is sent. It was typed only, so a call missing a
 * required field went out, whatever validation library was chosen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { endpointAt, loadGenerated, removeProjects } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({});
});

afterAll(async () => {
  await upstream.close();
  removeProjects("inline-body");
});

function stations(origin: string) {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Weather", version: "1" },
      servers: [{ url: origin }],
      tags: [{ name: "stations" }],
      paths: {
        "/stations": {
          post: {
            operationId: "createStation",
            tags: ["stations"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                  },
                },
              },
            },
            responses: { 201: { description: "created" } },
          },
        },
      },
    }),
  );
}

describe.each(["zod", "valibot", "arktype"] as const)(
  "an inline body, validated with %s",
  (validation) => {
    function createStation() {
      const files = generateCode(
        stations(upstream.origin),
        {
          type: "openapi",
          outputDir: "src/api",
          validation,
          generateSchemas: true,
          generateTypes: true,
        },
        "weather",
      );
      const { weatherApi } = loadGenerated(files, "src/api/weather/index.ts");
      return endpointAt(weatherApi, "stations", "createStation");
    }

    it("sends a call whose body has what it requires", async () => {
      upstream.requests.length = 0;

      await createStation()({ name: "North" });

      expect(upstream.requests.map((request) => request.path)).toEqual(["/stations"]);
    });

    it("refuses a call missing a required field before it is sent", async () => {
      upstream.requests.length = 0;

      await expect(createStation()({})).rejects.toThrow();
      expect(upstream.requests).toEqual([]);
    });
  },
);
