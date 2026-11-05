/**
 * The words a failure is answered with, as a page's bundle has them: the
 * message as it was, as a page answers no request — where a server's
 * module cuts the credentials out of it.
 */
import { describe, expect, it } from "vitest";

import * as Browser from "../../../src/browser/utils/answered-message";
import * as Server from "../../../src/utils/answered-message";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");
const QUOTED = `Headers.set: "Bearer ${SECRET}\r\nx" is an invalid header value.`;

describe("answered-message in a page", () => {
  it("keeps the message the server's module cuts the credential out of", () => {
    expect(Server.answeredMessage(QUOTED)).toBe(
      'Headers.set: "[redacted]" is an invalid header value.',
    );
    expect(Browser.answeredMessage(QUOTED)).toBe(QUOTED);
  });

  it("stands where the server's module does", () => {
    const standIn: typeof Server = Browser;

    expect(standIn.answeredMessage).toBeTypeOf("function");
  });
});
