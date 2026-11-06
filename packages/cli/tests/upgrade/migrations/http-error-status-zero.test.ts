import { describe, expect, it } from "vitest";

import { HTTP_ERROR_STATUS_ZERO } from "../../../src/upgrade/migrations/http-error-status-zero";
import { migrateWith } from "./migrate-with";

describe("0.5.0: isHTTPError(e) && e.status === 0", () => {
  it("tells a request that got no answer by isNetworkError() and isTimeoutError(), its import in isHTTPError's place", () => {
    const { text } = migrateWith(
      HTTP_ERROR_STATUS_ZERO,
      `import { createCaller, isHTTPError } from "@noverax/courier";
if (isHTTPError(error) && error.status === 0) retry();
const offline = !ready && isHTTPError(e.cause) && 0 == e.cause.status;
`,
    );

    expect(
      text,
    ).toBe(`import { createCaller, isNetworkError, isTimeoutError } from "@noverax/courier";
if (isNetworkError(error) || isTimeoutError(error)) retry();
const offline = !ready && (isNetworkError(e.cause) || isTimeoutError(e.cause));
`);
  });

  it("keeps isHTTPError for its other uses, and adds the two beside it", () => {
    const { text } = migrateWith(
      HTTP_ERROR_STATUS_ZERO,
      `import { isHTTPError } from "@noverax/courier";
if (isHTTPError(error) && error.status === 0) retry();
if (isHTTPError(error) && error.status === 404) missing();
`,
    );

    expect(text).toContain(
      'import { isHTTPError, isNetworkError, isTimeoutError } from "@noverax/courier";',
    );
    expect(text).toContain("if (isHTTPError(error) && error.status === 404) missing();");
  });

  it("leaves a check of another value's status, and an isHTTPError of the file's own", () => {
    const other =
      'import { isHTTPError } from "@noverax/courier";\nif (isHTTPError(a) && b.status === 0) {}\n';

    expect(migrateWith(HTTP_ERROR_STATUS_ZERO, other).text).toBe(other);
  });
});
