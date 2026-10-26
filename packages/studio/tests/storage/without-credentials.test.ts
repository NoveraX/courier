/**
 * What leaves the page that holds Studio's token holds no credentials. The
 * request log, the mocks' logs, saved sessions and the Playground history
 * are kept in the project's `.courier/studio.db`, a session is exported to
 * be handed around, and an agent and a page without the token read what
 * anyone on the machine may, so each keeps a credential header's name with
 * its value replaced — never the `Authorization`, cookie or API key the
 * project's requests sent — an address without its password or its secret
 * parameters, and an error's text and its cause with their credentials cut.
 */
import { REDACTED } from "@noverax/courier-studio-core";
import { describe, expect, it } from "vitest";

import { buildSession } from "../../src/server/session-builder";
import { exportAsHar } from "../../src/server/session-export-har";
import { exportAsPostman } from "../../src/server/session-export-postman";
import {
  headersWithoutCredentials,
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

  it("has the credentials cut from each kind of event's error text, and from a failure's cause", () => {
    const failed = withoutCredentials({
      type: "request:error",
      requestId: "r1",
      error: {
        type: "network",
        message: "fetch failed for https://ana:pw@api.test/x?token=s3cret",
        cause: { code: "ECONNREFUSED", message: "connect https://ana:pw@api.test/x" },
      },
    });
    const texts = [
      { type: "http:fetch:error", message: "refused token=s3cret" },
      { type: "middleware:error", error: "refused token=s3cret" },
      { type: "stream:error", error: "closed Bearer B34rer" },
      { type: "mock:request:error", message: "refused x-api-key=s3cret" },
    ].map(withoutCredentials);

    expect(failed).toMatchObject({
      error: {
        type: "network",
        message: "fetch failed for https://api.test/x?token=[redacted]",
        cause: { code: "ECONNREFUSED", message: "connect https://api.test/x" },
      },
    });
    expect(texts).toEqual([
      { type: "http:fetch:error", message: "refused token=[redacted]" },
      { type: "middleware:error", error: "refused token=[redacted]" },
      { type: "stream:error", error: "closed Bearer [redacted]" },
      { type: "mock:request:error", message: "refused x-api-key=[redacted]" },
    ]);
  });

  it("has why a stream's last connection ended cut, and a cause in another shape left out", () => {
    const told = withoutCredentials({
      type: "stream:status",
      requestId: "s1",
      status: "reconnecting",
      cause: { code: "ECONNREFUSED", message: "connect https://ana:pw@api.test/feed" },
    });
    const malformed = withoutCredentials({ type: "stream:status", cause: "token=s3cret" });

    expect(told).toMatchObject({
      cause: { code: "ECONNREFUSED", message: "connect https://api.test/feed" },
    });
    expect(malformed).toEqual({ type: "stream:status" });
  });

  it("keeps an address without its password or its secret parameters, in a redirect's Location too", () => {
    const fetched = withoutCredentials({
      type: "http:fetch:start",
      url: "https://ana:pw@api.test/v1/users?page=2&api_key=k3y#top",
      headers: { location: "https://ana:pw@api.test/next?sig=abc123" },
    });

    expect(fetched).toMatchObject({
      url: "https://api.test/v1/users?page=2&api_key=[redacted]#top",
      headers: { location: "https://api.test/next?sig=[redacted]" },
    });
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

  it("keeps its address without the password or the secret parameters", () => {
    const withAddress = buildSession({
      requests: [
        {
          id: "r1",
          source: "api",
          method: "me",
          url: "https://ana:pw@api.test/me?api_key=k3y&v=2",
          startedAt: 1,
        },
      ],
      apps: [],
    });

    expect(withAddress.requests[0]?.url).toBe("https://api.test/me?api_key=[redacted]&v=2");
  });

  it("exports none, as a HAR or a Postman collection", () => {
    const exported = JSON.stringify([exportAsHar(session), exportAsPostman(session)]);

    expect(exported).not.toContain("Bearer t");
    expect(exported).not.toContain("sid=1");
  });
});
