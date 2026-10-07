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
  isCredentialHeader,
  REDACTED,
  withoutCredentials,
} from "../../src/server/storage/without-credentials";

describe("a header that carries a credential", () => {
  it("is told by its name, in any case", () => {
    const credentials = [
      "Authorization",
      "proxy-authorization",
      "Cookie",
      "Set-Cookie",
      "X-Api-Key",
      "api-key",
    ];
    const others = ["accept", "content-type", "x-request-id", "user-agent", "x-trace"];

    expect(credentials.filter(isCredentialHeader)).toEqual(credentials);
    expect(
      [...others, "x-auth-token", "x_session_id", "x-csrf-token"].filter(isCredentialHeader),
    ).toEqual(["x-auth-token", "x_session_id", "x-csrf-token"]);
  });

  it("includes the double-submit token a session repeats, written as one word", () => {
    const tokens = ["X-CSRFToken", "x-xsrf-token", "X-XSRFToken", "csrf"];

    expect(tokens.filter(isCredentialHeader)).toEqual(tokens);
    expect(["x-csrf", "x-forwarded-for", "accept-language"].filter(isCredentialHeader)).toEqual([
      "x-csrf",
    ]);
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
