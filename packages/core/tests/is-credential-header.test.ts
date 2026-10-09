/**
 * Which headers carry a credential, the one rule Studio's storage and a
 * printed HTTPError keep the values of out of sight by.
 */
import { describe, expect, it } from "vitest";

import { isCredentialHeader } from "../src/utils/is-credential-header";

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

  it("includes a webhook's signature, which with its body would let anyone deliver it again", () => {
    const signatures = [
      "Stripe-Signature",
      "X-Hub-Signature-256",
      "webhook-signature",
      "svix-signature",
      "x-billing-signature",
    ];

    expect(signatures.filter(isCredentialHeader)).toEqual(signatures);
    expect(["webhook-id", "webhook-timestamp", "x-signed-at"].filter(isCredentialHeader)).toEqual(
      [],
    );
  });
});
