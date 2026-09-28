/**
 * `.raw` on the test client.
 *
 * The test client is typed as the real one, where `.raw` resolves to
 * `{ status, headers, data }`, but it resolved to the bare data — code that
 * read `response.status` under test read `undefined`.
 */
import { describe, expect, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { createTestClient } from "../src/testing";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://api.example",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        getById: endpoint
          .get(":id")
          .variables<{ id: number }>()
          .response<{ id: number }>(),
      },
    }),
  },
});

describe(".raw on the test client", () => {
  it("resolves to the status, headers and data, as the real client does", async () => {
    const { client, mock } = createTestClient<typeof api>();
    mock("users", "getById").resolves({ id: 1 });

    const response = await client.users.raw.getById({ id: 1 });

    expect(response.status).toBe(200);
    expect(response.headers).toBeInstanceOf(Headers);
    expect(response.data).toEqual({ id: 1 });
  });

  it("still rejects a mocked failure with its HTTPError", async () => {
    const { client, mock } = createTestClient<typeof api>();
    mock("users", "getById").rejects(404, { message: "missing" });

    const error = await client.users.raw.getById({ id: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(404);
  });

  it("leaves a plain call resolving to the data", async () => {
    const { client, mock } = createTestClient<typeof api>();
    mock("users", "getById").resolves({ id: 1 });

    await expect(client.users.getById({ id: 1 })).resolves.toEqual({ id: 1 });
  });
});
