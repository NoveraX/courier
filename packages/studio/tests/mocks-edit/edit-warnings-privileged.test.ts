/**
 * A fixed port the process may not bind is named as such, not as one that
 * another process holds and may later free.
 */
import { describe, expect, it, vi } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";

vi.mock("../../src/server/mock-manager/port-problem", () => ({
  portProblem: async (port: number) => (port < 1024 ? "not permitted" : null),
}));

const { editWarnings } = await import("../../src/server/mocks-edit/edit-warnings");

describe("editWarnings for a privileged port", () => {
  it("says the port needs privileges Studio does not have", async () => {
    const loaded = { config: { sources: { api: {} } }, mocks: { entries: {} } } as unknown as LoadedCourierConfig;

    const warnings = await editWarnings({
      requests: [{ key: "apiMock", source: "api", port: 80, seedCount: 20, autoStart: true }],
      loaded,
      summaries: [],
      target: "courier.mocks.ts",
      creates: false,
      mockBasePort: 7001,
    });

    expect(warnings).toEqual(["Port 80 needs privileges Studio does not have, so apiMock cannot listen on it."]);
  });
});
