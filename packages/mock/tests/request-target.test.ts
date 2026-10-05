/**
 * @vitest-environment node
 *
 * The path a mock logs for a request carries its query string, so Studio's
 * log shows the request as it came and its cURL sends it again with the
 * variables a read was asked with.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { requestTarget } from "../src/server/request-target";

const { endpoint } = courier();

const server = createAutoMockServer({
  source: defineApi({
    baseURL: "http://api.test",
    groups: {
      users: defineGroup({
        prefix: "/users",
        endpoints: {
          list: endpoint
            .get("")
            .variables<{ page?: number }>()
            .response(z.array(z.object({ id: z.number() }))),
        },
      }),
    },
  }),
  port: 0,
  log: false,
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

describe("the path a mock logs", () => {
  it("keeps the query string the request was sent with", async () => {
    const paths: string[] = [];
    server.requestHooks.onStart = (_id, _verb, path) => {
      paths.push(path);
    };

    await fetch(`${url}/users?page=2&sort=name`);
    Reflect.deleteProperty(server.requestHooks, "onStart");

    expect(paths).toEqual(["/users?page=2&sort=name"]);
  });

  it("is the bare path when nothing was asked in the query", () => {
    expect(requestTarget("http://127.0.0.1:7001/users")).toBe("/users");
  });
});
