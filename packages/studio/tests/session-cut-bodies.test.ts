/**
 * A request whose bodies Studio kept only a part of — too large for its
 * log — is saved with the size of each whole, and its exports say so.
 */
import { describe, expect, it } from "vitest";

import { buildSession } from "../src/server/session-builder";
import { exportAsHar } from "../src/server/session-export-har";
import { exportAsPostman } from "../src/server/session-export-postman";

const session = buildSession({
  requests: [
    {
      id: "r1",
      source: "api",
      group: "orders",
      method: "import",
      httpMethod: "POST",
      variables: { rows: [{ id: 1 }, "… 9,999 more items"] },
      variablesCutFrom: 412_000,
      statusCode: 200,
      data: [{ id: 1 }, "… 45,999 more items"],
      dataCutFrom: 3_821_455,
      startedAt: 1,
    },
  ],
  apps: [],
});

describe("a saved request with bodies too large for its log", () => {
  it("keeps the size of each whole body", () => {
    expect(session.requests[0]).toMatchObject({
      variablesCutFrom: 412_000,
      dataCutFrom: 3_821_455,
    });
  });

  it("exports to HAR with each whole's size, and a comment on each part", () => {
    const [entry] = exportAsHar(session).log.entries;

    expect(entry?.request.bodySize).toBe(412_000);
    expect(entry?.request.postData?.comment).toBe(
      "Studio kept a part of this body, too large for its log: the whole was 412,000 bytes.",
    );
    expect(entry?.response.content).toMatchObject({
      size: 3_821_455,
      comment:
        "Studio kept a part of this body, too large for its log: the whole was 3,821,455 bytes.",
    });
  });

  it("exports to Postman with a note on each part", () => {
    const [item] = exportAsPostman(session).item;

    expect(item?.request.description).toContain("the whole was 412,000 bytes");
    expect(item?.response[0]?.name).toBe(
      "200 response — Studio kept a part of this body, too large for its log: the whole was 3,821,455 bytes.",
    );
  });

  it("exports a request kept whole with no note", () => {
    const whole = buildSession({
      requests: [
        {
          id: "r2",
          source: "api",
          method: "rename",
          httpMethod: "POST",
          variables: { id: 1 },
          data: {},
          startedAt: 1,
        },
      ],
      apps: [],
    });

    const [entry] = exportAsHar(whole).log.entries;
    expect(entry?.request.postData?.text).toBe('{"id":1}');
    expect(entry?.request.postData).not.toHaveProperty("comment");
    expect(entry?.response.content).not.toHaveProperty("comment");
    expect(exportAsPostman(whole).item[0]?.request).not.toHaveProperty("description");
  });
});

describe("a saved read", () => {
  const read = buildSession({
    requests: [
      {
        id: "r3",
        source: "api",
        group: "users",
        method: "list",
        httpMethod: "GET",
        url: "https://api.example/users?page=2&sort=name",
        variables: { page: 2, sort: "name" },
        startedAt: 1,
      },
      {
        id: "r4",
        source: "api",
        group: "users",
        method: "search",
        httpMethod: "QUERY",
        url: "https://api.example/users/search",
        variables: { team: "core" },
        startedAt: 2,
      },
    ],
    apps: [],
  });

  it("exports to HAR with its variables in the query string, not a body", () => {
    const [list, search] = exportAsHar(read).log.entries;

    expect(list?.request.queryString).toEqual([
      { name: "page", value: "2" },
      { name: "sort", value: "name" },
    ]);
    expect(list?.request).not.toHaveProperty("postData");
    expect(list?.request.bodySize).toBe(0);
    expect(search?.request).toMatchObject({
      method: "QUERY",
      postData: { text: '{"team":"core"}' },
    });
  });

  it("exports to Postman with no body, its URL carrying the query", () => {
    const [list, search] = exportAsPostman(read).item;

    expect(list?.request.url).toBe("https://api.example/users?page=2&sort=name");
    expect(list?.request).not.toHaveProperty("body");
    expect(search?.request.body?.raw).toContain('"team": "core"');
  });
});
