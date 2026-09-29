import { decodeMessage, encodeMessage } from "@noverax/courier/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { MockServer } from "../../../src/server/create-mock-server";
import { createMockServer } from "../../../src/server/create-mock-server";

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createMockServer({
    port: 0,
    log: false,
    mappings: [
      {
        prefix: "/rt",
        group: "rt",
        methods: ["room", "plain"],
        endpoints: [
          { name: "room", operation: "custom", path: "room", transport: "ws" },
          { name: "plain", operation: "custom", path: "plain", httpMethod: "GET" },
        ],
      },
    ],
  });
  server.mock("rt", "plain").returns((ctx) => ({ variables: ctx.variables }));
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

/** The variables a channel's context holds when joined at `query` */
async function channelVariables(query: string): Promise<unknown> {
  let joined: unknown;
  server.mock("rt", "room").channel((ctx) => {
    joined = ctx.variables;
    return { onMessage: () => undefined };
  });
  const ws = new WebSocket(`${url.replace(/^http/, "ws")}/rt/room?${query}`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () =>
      ws.send(encodeMessage({ type: "subscribe", topic: "rt.room", id: "s1" })),
    );
    ws.once("message", (raw: Buffer) => {
      const frame = decodeMessage(raw.toString());
      if (frame.type === "subscribed") resolve();
      else reject(new Error(`expected subscribed, got ${frame.type}`));
    });
    ws.once("error", reject);
  });
  ws.close();
  return joined;
}

describe("WebSocket query variables", () => {
  it("keeps values that are not written as numbers as the strings they are", async () => {
    const variables = await channelVariables("code=007&empty=&big=1e3&id=12");

    expect(variables).toEqual({ code: "007", empty: "", big: "1e3", id: 12 });
  });

  it("reads a query the way the endpoint routes over HTTP read it", async () => {
    const query = "code=007&empty=&big=1e3&id=12";

    const overHttp = await fetch(`${url}/rt/plain?${query}`).then((res) => res.json());

    expect(await channelVariables(query)).toEqual(overHttp.variables);
  });
});
