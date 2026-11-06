import { describe, expect, it } from "vitest";

import { RETRY_ON_ZERO } from "../../../src/upgrade/migrations/retry-on-zero";
import { migrateWith } from "./migrate-with";

describe("0.5.0: retryOn's 0", () => {
  it("names network and timeout for the 0 a policy listed, in retryMiddleware and an endpoint's .retry()", () => {
    const { text } = migrateWith(
      RETRY_ON_ZERO,
      `import { retryMiddleware } from "@noverax/courier/middleware";
import { endpoint } from "@noverax/courier/define";
const retry = retryMiddleware({ limit: 3, retryOn: [0, 503] });
const users = endpoint.get("users").retry({ retryOn: [503, 0, "timeout"] });
const other = somethingElse.retry({ retryOn: [0] });
`,
    );

    expect(text).toContain('retryMiddleware({ limit: 3, retryOn: ["network", "timeout", 503] })');
    expect(text).toContain('.retry({ retryOn: [503, "network", "timeout"] })');
    expect(text).toContain("somethingElse.retry({ retryOn: [0] })");
  });

  it("drops a second 0 with its comma, and finds a retryOn written as a function", () => {
    const { text, findings } = migrateWith(
      RETRY_ON_ZERO,
      `import { retryMiddleware } from '@noverax/courier'
retryMiddleware({ retryOn: [0, 0, 502] })
retryMiddleware({ retryOn: (response) => response.status === 503 })
`,
    );

    expect(text).toContain("retryOn: ['network', 'timeout', 502]");
    expect(findings).toEqual([expect.objectContaining({ line: 3 })]);
  });
});
