/**
 * How an `HTTPError` prints, as a page's bundle has it: by the browser's
 * console's own rules, where a server's module gives Node a hook that
 * hides every credential header's value.
 */
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import * as Browser from "../../../src/browser/errors/http-error-inspect";
import { HTTPError } from "../../../src/errors/http-error";
import * as Server from "../../../src/errors/http-error-inspect";

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

describe("http-error-inspect in a page", () => {
  it("gives no hook of Node's, where the server's module gives one", () => {
    const inPage = Object.create(null) as HTTPError;
    const onServer = Object.create(null) as HTTPError;

    Browser.defineNodePrinting(inPage);
    Server.defineNodePrinting(onServer);

    expect(Object.getOwnPropertySymbols(inPage)).toEqual([]);
    expect(Object.getOwnPropertySymbols(onServer)).toEqual([INSPECT]);
  });

  it("leaves Node printing an HTTPError without its credentials where the server runs", () => {
    const error = new HTTPError({
      status: 401,
      headers: new Headers({ "set-cookie": "sid=s3cr3t; Path=/" }),
      data: null,
    });

    expect(inspect(error)).toContain("sid=[redacted]");
    expect(inspect(error)).not.toContain("s3cr3t");
  });

  it("stands where the server's module does", () => {
    const standIn: typeof Server = Browser;

    expect(standIn.defineNodePrinting).toBeTypeOf("function");
  });
});
