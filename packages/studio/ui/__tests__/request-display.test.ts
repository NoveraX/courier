/**
 * How a request reads in the Timeline and the inspector: its state — a
 * stream streaming until it closes or fails — its name split for dimming
 * the source, its URL in parts, the status column's label, and how slow
 * its duration reads.
 */
import { describe, expect, it } from "vitest";

import { durationTone } from "@/features/requests/duration-tone";
import {
  codeLabel,
  endpointName,
  endpointParts,
  httpMethodOf,
  pathOf,
  urlParts,
} from "@/features/requests/request-parts";
import { isFailedState, isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import { requestEntry } from "./request-entry-fixture";

describe("a request's state", () => {
  it("is its status unless it streams", () => {
    expect(requestStateOf(requestEntry({ status: "validation_error" }))).toBe("validation_error");
  });

  it("is streaming for an open stream, closed once it completes, error once it fails", () => {
    const stream = requestEntry({ transport: "sse", status: "success" });

    expect(requestStateOf({ ...stream, streamStatus: "streaming" })).toBe("streaming");
    expect(requestStateOf({ ...stream, streamStatus: undefined })).toBe("streaming");
    expect(requestStateOf({ ...stream, streamStatus: "complete" })).toBe("closed");
    expect(requestStateOf({ ...stream, streamStatus: "error" })).toBe("error");
    expect(isStreamRequest({ transport: "ws" })).toBe(true);
    expect(isStreamRequest({ transport: "http" })).toBe(false);
  });

  it("counts a broken schema as a failure, and nothing else but an error", () => {
    expect(isFailedState("error")).toBe(true);
    expect(isFailedState("validation_error")).toBe(true);
    expect(isFailedState("aborted")).toBe(false);
    expect(isFailedState("pending")).toBe(false);
  });
});

describe("a request's name and URL", () => {
  it("splits the source from the group and the endpoint", () => {
    expect(endpointParts(requestEntry())).toEqual({ prefix: "api.", name: "users.list" });
    expect(endpointName(requestEntry({ group: undefined, method: "health" }))).toBe("api.health");
  });

  it("reads the origin, the path and the query of an absolute URL, and only the path of a relative one", () => {
    expect(urlParts("http://localhost:5173/api/users?page=2&limit=20")).toEqual({
      origin: "http://localhost:5173",
      path: "/api/users",
      query: [
        { key: "page", value: "2" },
        { key: "limit", value: "20" },
      ],
    });
    expect(urlParts("/api/users")).toEqual({ origin: "", path: "/api/users", query: [] });
    expect(urlParts(undefined)).toBeNull();
    expect(pathOf("http://localhost:5173/api/users?page=2")).toBe("/api/users?page=2");
    expect(pathOf(undefined)).toBe("");
  });

  it("names the method upper case, GET when the request says none", () => {
    expect(httpMethodOf({ httpMethod: "patch" })).toBe("PATCH");
    expect(httpMethodOf({ httpMethod: undefined })).toBe("GET");
  });
});

describe("the status column", () => {
  it("shows the code, with a mark for a broken schema, and what a request without one is", () => {
    const http = { statusCode: 422, transport: "http" as const };

    expect(codeLabel(http, "error")).toBe("422");
    expect(codeLabel({ ...http, statusCode: 200 }, "validation_error")).toBe("200!");
    expect(codeLabel(http, "pending")).toBe("···");
    expect(codeLabel(http, "aborted")).toBe("ABRT");
    expect(codeLabel({ statusCode: undefined, transport: "http" }, "error")).toBe("—");
    expect(codeLabel({ statusCode: 101, transport: "ws" }, "streaming")).toBe("WS");
    expect(codeLabel({ statusCode: 200, transport: "sse" }, "closed")).toBe("SSE");
  });
});

describe("a duration", () => {
  it("reads slow from the threshold, very slow from twice it", () => {
    expect(durationTone(499, 500)).toBe("normal");
    expect(durationTone(500, 500)).toBe("warn");
    expect(durationTone(1000, 500)).toBe("err");
  });
});
