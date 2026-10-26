/**
 * Why a request that got no answer failed, as the app tells Studio: the
 * platform's code and text as it said them. Studio shows them whole to the
 * page that holds its token, and cuts what leaves it; the app ships no
 * code for that.
 */
import { describe, expect, it } from "vitest";

import { HTTPError } from "../src/errors";
import { ConfigurationError } from "../src/errors/configuration-error";
import { failureCause } from "../src/studio/failure-cause";

function unanswered(data: unknown): HTTPError {
  return new HTTPError({ status: 0, headers: new Headers(), data });
}

describe("failureCause", () => {
  it("reads the system's code and text from a request that got no answer", () => {
    const error = unanswered({
      success: false,
      message: "getaddrinfo ENOTFOUND no-such-host.invalid",
      code: "ENOTFOUND",
    });

    expect(failureCause(error)).toEqual({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND no-such-host.invalid",
    });
  });

  it("passes the text on as the platform wrote it, an address and all", () => {
    const text = "connect ECONNREFUSED for https://ana:pw@api.test/v1/users?token=s3cret";

    expect(failureCause(unanswered({ message: text, code: "ECONNREFUSED" }))).toEqual({
      code: "ECONNREFUSED",
      message: text,
    });
  });

  it("takes a code only as the system names it, a string", () => {
    expect(failureCause(unanswered({ message: "refused", code: 23 }))).toEqual({
      message: "refused",
    });
    expect(failureCause(unanswered({ message: "refused", code: "" }))).toEqual({
      message: "refused",
    });
  });

  it("has none for a request the upstream answered", () => {
    const error = new HTTPError({
      status: 500,
      headers: new Headers(),
      data: { message: "boom", code: "INTERNAL" },
    });

    expect(failureCause(error)).toBeUndefined();
  });

  it("reads the system's code and text from a connection the app's own code made, as a middleware's fetch", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:4010"), {
      code: "ECONNREFUSED",
    });

    expect(failureCause(new TypeError("fetch failed", { cause: refused }))).toEqual({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:4010",
    });
    expect(failureCause(refused)).toEqual({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:4010",
    });
  });

  it("reads the system's code and text however deep the app's own errors wrap it", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:4010"), {
      code: "ECONNREFUSED",
      syscall: "connect",
      address: "127.0.0.1",
      port: 4010,
    });
    const expired = Object.assign(new Error("certificate has expired"), {
      code: "CERT_HAS_EXPIRED",
    });
    const proxy = Object.assign(new Error("Secure Proxy Connection failed", { cause: expired }), {
      code: "UND_ERR_PRX_TLS",
    });
    const wrapped = new Error("Google's token endpoint could not be reached", {
      cause: new TypeError("fetch failed", { cause: refused }),
    });

    expect(failureCause(wrapped)).toEqual({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:4010",
    });
    expect(failureCause(new TypeError("fetch failed", { cause: proxy }))).toEqual({
      code: "CERT_HAS_EXPIRED",
      message: "certificate has expired",
    });
  });

  it("reads below the first error only a network failure, never a file's or a database's", () => {
    const missing = Object.assign(
      new Error("ENOENT: no such file or directory, open '/srv/app/client-key.json'"),
      { errno: -2, code: "ENOENT", syscall: "open", path: "/srv/app/client-key.json" },
    );
    const duplicate = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      { code: "23505" },
    );
    const keyLoaded = new Error("Could not load the client's key", {
      cause: new Error("A config step failed", { cause: missing }),
    });
    const userSaved = new Error("Could not save the user", {
      cause: new Error("The query failed", { cause: duplicate }),
    });

    expect(failureCause(keyLoaded)).toBeUndefined();
    expect(failureCause(userSaved)).toBeUndefined();
  });

  it("reads the first error under the app's own by whatever code it names, as before", () => {
    const missing = Object.assign(
      new Error("ENOENT: no such file or directory, open '/srv/k.json'"),
      {
        code: "ENOENT",
        syscall: "open",
        path: "/srv/k.json",
      },
    );

    expect(failureCause(new Error("Could not load the key", { cause: missing }))).toEqual({
      code: "ENOENT",
      message: "ENOENT: no such file or directory, open '/srv/k.json'",
    });
  });

  it("reads a call's own record under the app's error, and none when that call was answered", () => {
    const lookup = unanswered({ message: "getaddrinfo ENOTFOUND api.test", code: "ENOTFOUND" });
    const answered = new HTTPError({ status: 401, headers: new Headers(), data: {} });

    expect(failureCause(new Error("No user id", { cause: lookup }))).toEqual({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.test",
    });
    expect(failureCause(new Error("The token was refused", { cause: answered }))).toBeUndefined();
  });

  it("reads an app's own code only where nothing lies under it, and ends a chain that loops", () => {
    const own = Object.assign(new Error("Lookup failed", { cause: new Error("inner") }), {
      code: "E_LOOKUP",
    });
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    first.cause = second;

    expect(failureCause(own)).toBeUndefined();
    expect(failureCause(second)).toBeUndefined();
  });

  it("has none for an error that names no code, or one of Courier's own, which says what it is", () => {
    expect(failureCause(new Error("getaddrinfo ENOTFOUND x"))).toBeUndefined();
    expect(failureCause("ENOTFOUND")).toBeUndefined();
    expect(
      failureCause(new ConfigurationError("URL_NOT_ABSOLUTE", "A path where no page resolves it")),
    ).toBeUndefined();
  });

  it("tells a gathered failure by its code when its errors are no list", () => {
    const gathered = Object.assign(new AggregateError([], ""), {
      errors: null,
      code: "ECONNREFUSED",
    });

    expect(failureCause(new TypeError("fetch failed", { cause: gathered }))).toEqual({
      code: "ECONNREFUSED",
      message: "ECONNREFUSED",
    });
  });

  it("has none when the failure carries no text", () => {
    expect(failureCause(unanswered(undefined))).toBeUndefined();
    expect(failureCause(unanswered({ code: "ENOTFOUND" }))).toBeUndefined();
    expect(failureCause(unanswered({ message: "   " }))).toBeUndefined();
  });
});
