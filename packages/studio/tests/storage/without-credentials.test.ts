/**
 * What Studio writes down holds no credentials. The request log, the mocks'
 * logs, saved sessions and the Playground history are kept in the project's
 * `.courier/studio.db`, and a session is exported to be handed around, so
 * each keeps a credential header's name with its value replaced — never the
 * `Authorization`, cookie or API key the project's requests sent.
 */
import { describe, expect, it } from "vitest";

import { buildSession } from "../../src/server/session-builder";
import { exportAsHar } from "../../src/server/session-export-har";
import { exportAsPostman } from "../../src/server/session-export-postman";
import {
  headersWithoutCredentials,
  REDACTED,
  withoutCredentials,
} from "../../src/server/storage/without-credentials";

describe("a header that carries a credential", () => {
  it("is told by its name, the double-submit token's written as one word too", () => {
    const written = headersWithoutCredentials({
      Authorization: "Bearer t",
      "X-Api-Key": "k",
      "X-CSRFToken": "c",
      x_session_id: "s",
      "x-request-id": "r1",
      accept: "*/*",
    });

    expect(written).toEqual({
      Authorization: REDACTED,
      "X-Api-Key": REDACTED,
      "X-CSRFToken": REDACTED,
      x_session_id: REDACTED,
      "x-request-id": "r1",
      accept: "*/*",
    });
  });

  it("keeps its name, with its value replaced", () => {
    expect(headersWithoutCredentials({ authorization: "Bearer t", accept: "*/*" })).toEqual({
      authorization: REDACTED,
      accept: "*/*",
    });
  });
});

describe("an event or a history entry, as it is written down", () => {
  it("has its header fields redacted, and nothing else touched", () => {
    const event = {
      type: "request:end",
      requestHeaders: { authorization: "Bearer t", accept: "json" },
      headers: { "set-cookie": "sid=1", "content-type": "application/json" },
      data: { headers: { authorization: "the answer's own field" } },
    };

    expect(withoutCredentials(event)).toEqual({
      type: "request:end",
      requestHeaders: { authorization: REDACTED, accept: "json" },
      headers: { "set-cookie": REDACTED, "content-type": "application/json" },
      data: { headers: { authorization: "the answer's own field" } },
    });
  });

  it("reads the Playground's headers as its editor writes them, comments and all", () => {
    const entry = {
      id: "e1",
      headers: '{\n  // who calls\n  "Authorization": "Bearer t",\n  "x-trace": "abc",\n}',
    };

    expect(withoutCredentials(entry)).toEqual({
      id: "e1",
      headers: JSON.stringify({ Authorization: REDACTED, "x-trace": "abc" }, null, 2),
    });
  });

  it("drops headers text that does not read as an object", () => {
    expect(withoutCredentials({ headers: "Authorization: Bearer t" })).toEqual({ headers: "{}" });
  });
});

describe("a saved session", () => {
  const session = buildSession({
    requests: [
      {
        id: "r1",
        source: "api",
        method: "me",
        requestHeaders: { authorization: "Bearer t", accept: "json" },
        headers: { "set-cookie": "sid=1", "content-type": "application/json" },
        startedAt: 1,
      },
    ],
    apps: [],
  });

  it("keeps no credential", () => {
    expect(session.requests[0]?.requestHeaders).toEqual({
      authorization: REDACTED,
      accept: "json",
    });
    expect(session.requests[0]?.responseHeaders).toEqual({
      "set-cookie": REDACTED,
      "content-type": "application/json",
    });
  });

  it("exports none, as a HAR or a Postman collection", () => {
    const exported = JSON.stringify([exportAsHar(session), exportAsPostman(session)]);

    expect(exported).not.toContain("Bearer t");
    expect(exported).not.toContain("sid=1");
  });
});
