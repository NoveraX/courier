/**
 * @vitest-environment jsdom
 *
 * The Error tab as it draws a request that got no answer: its kind, its
 * code once — where the code says what the kind does not — the message
 * with its own line breaks, why no answer came unless the message says it,
 * where it failed and what usually fixes it — and, of an answer that broke
 * its schema, each issue with what arrived. And the Response tab of a
 * request with no answer, and of a Playground run like it, says why no
 * answer came in place of an empty body.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { entryPayloadView } from "@/features/playground/entry-view";
import { responseView } from "@/features/requests/payload-view";
import { failureOf } from "@/features/requests/request-failure";
import { FailureTab } from "@/inspector/tabs/failure-tab";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { requestEntry } from "./request-entry-fixture";

afterEach(cleanup);

function unanswered(fields: Partial<RequestEntry["error"] & object>): RequestEntry {
  return requestEntry({
    status: "error",
    statusCode: undefined,
    error: { type: "network", message: "Network request failed", ...fields },
  });
}

function run(fields: Partial<PlaygroundHistoryEntry>): PlaygroundHistoryEntry {
  return {
    id: "e1",
    rid: "r1",
    source: "api",
    group: "users",
    method: "list",
    variables: "{}",
    headers: "{}",
    mode: "direct",
    timestamp: 1,
    status: "error",
    ...fields,
  };
}

function drawn(request: RequestEntry): void {
  const failure = failureOf(request);
  if (!failure) throw new Error("the request did not fail");
  render(<FailureTab request={request} failure={failure} />);
}

describe("the Error tab", () => {
  it("draws the kind, the code, the message and why no answer came", () => {
    drawn(
      unanswered({ cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:1" } }),
    );

    expect(screen.getByText("NETWORK")).toBeTruthy();
    expect(screen.getByText("ECONNREFUSED")).toBeTruthy();
    expect(screen.getByText("Network request failed")).toBeTruthy();
    expect(screen.getByText("connect ECONNREFUSED 127.0.0.1:1")).toBeTruthy();
    expect(screen.getByText(/connection to it failed/)).toBeTruthy();
  });

  it("draws a timeout's kind once, and its cause not again under the message", () => {
    drawn(
      unanswered({
        type: "timeout",
        message: "Request timed out after 5000 ms",
        cause: { code: "TIMEOUT", message: "The request timed out after 5000 ms" },
      }),
    );

    const kind = screen.getAllByText("TIMEOUT");
    expect(kind).toHaveLength(1);
    expect(kind[0]?.parentElement?.children).toHaveLength(1);
    expect(screen.queryByText("The request timed out after 5000 ms")).toBeNull();
  });

  it("keeps the line breaks of a message that has them", () => {
    drawn(
      unanswered({
        type: "unknown",
        message: "Courier could not tell where the app listens.\nSet COURIER_APP_URL.",
      }),
    );

    const message = screen.getByText(
      "Courier could not tell where the app listens. Set COURIER_APP_URL.",
    );
    expect(message.textContent).toBe(
      "Courier could not tell where the app listens.\nSet COURIER_APP_URL.",
    );
    expect(message.className).toContain("whitespace-pre-line");
  });
});

describe("the Error tab of an answer that broke its schema", () => {
  it("draws each issue where it is in the answer, what arrived and what was expected", () => {
    drawn(
      requestEntry({
        status: "validation_error",
        statusCode: 200,
        data: { user: { id: "one" } },
        error: {
          type: "validation",
          message: "Response validation failed",
          validationIssues: [
            { path: "user.id", message: "Expected number, received string", expected: "number" },
          ],
        },
      }),
    );

    expect(screen.getByText("Schema issues")).toBeTruthy();
    expect(screen.getByText("user.id")).toBeTruthy();
    expect(screen.getByText("Expected number, received string")).toBeTruthy();
    expect(screen.getByText('"one"')).toBeTruthy();
    expect(screen.getByText("number")).toBeTruthy();
  });
});

describe("the Response tab of a request that got no answer", () => {
  it("says why no answer came, in place of an empty body", () => {
    const view = responseView(
      unanswered({ cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" } }),
    );

    expect(view.empty).toEqual({
      title: "No answer",
      detail: "ENOTFOUND · getaddrinfo ENOTFOUND api.test",
    });
  });

  it("says the same of a Playground run the runtime has not reported yet", () => {
    const entry = run({
      statusCode: 0,
      response: {
        success: false,
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:1",
      },
    });

    expect(entryPayloadView(entry).empty).toEqual({
      title: "No answer",
      detail: "ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:1",
    });
  });

  it("shows the body of a run the API answered, though it reads like a cause", () => {
    const body = { code: "OUT_OF_STOCK", message: "The item is gone" };

    const view = entryPayloadView(run({ statusCode: 409, response: body }));

    expect(view.empty).toBeUndefined();
    expect(view.value).toEqual(body);
    expect(view.chips).toEqual([{ label: "409", tone: "err" }]);
  });

  it("still says an answer with no body was empty", () => {
    const view = responseView(
      requestEntry({ status: "success", statusCode: 204, data: undefined }),
    );

    expect(view.empty).toEqual({
      title: "204 No Content",
      detail: "The server answered with an empty body.",
    });
  });
});
