/**
 * How the Playground's Response switch marks the run shown on a phone: in
 * flight, its status code coloured as the Timeline colours one, a broken
 * schema's amber, and a stream's state.
 */
import { describe, expect, it } from "vitest";

import { answerMark } from "@/screens/playground/answer-mark";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { requestEntry } from "./request-entry-fixture";

function run(fields: Partial<PlaygroundHistoryEntry>): PlaygroundHistoryEntry {
  return {
    id: "h1",
    rid: "rid-1",
    source: "api",
    group: "users",
    method: "create",
    variables: "{}",
    headers: "{}",
    mode: "direct",
    timestamp: 1_000_000,
    status: "success",
    ...fields,
  };
}

describe("answerMark", () => {
  it("marks nothing before anything is sent", () => {
    expect(answerMark(null, undefined)).toBeUndefined();
  });

  it("marks a call in flight", () => {
    expect(answerMark(run({ status: "pending" }), undefined)).toEqual({
      text: "···",
      tone: "warn",
    });
  });

  it("gives an answered call its status code, red from 400", () => {
    expect(answerMark(run({ statusCode: 201 }), undefined)).toEqual({ text: "201", tone: "ok" });
    expect(answerMark(run({ status: "error", statusCode: 404 }), undefined)).toEqual({
      text: "404",
      tone: "err",
    });
  });

  it("says ERR for a call that failed without an answer", () => {
    expect(answerMark(run({ status: "error" }), undefined)).toEqual({ text: "ERR", tone: "err" });
  });

  it("takes the code from the request the run made, amber when it broke its schema", () => {
    const row = requestEntry({ status: "validation_error", statusCode: 200 });

    expect(answerMark(run({ statusCode: undefined }), row)).toEqual({ text: "200", tone: "warn" });
  });

  it("follows a stream from connecting to live, closed or failed", () => {
    const stream = (fields: Partial<PlaygroundHistoryEntry>) =>
      answerMark(run({ transport: "sse", status: "pending", ...fields }), undefined);

    expect(stream({ streamStatus: "connecting" })).toEqual({ text: "···", tone: "brand" });
    expect(stream({ streamStatus: "streaming" })).toEqual({ text: "live", tone: "brand" });
    expect(stream({ status: "success", streamStatus: "complete" })).toEqual({
      text: "closed",
      tone: "subtle",
    });
    expect(stream({ status: "error", streamStatus: "error" })).toEqual({
      text: "ERR",
      tone: "err",
    });
  });
});
