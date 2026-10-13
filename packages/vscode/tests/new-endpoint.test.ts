/**
 * New Endpoint, asked of a Studio that does not show where the project's
 * groups write their endpoints: refused for want of the project's token,
 * it says so in words a person acts on — not that the project has no group
 * — and adds nothing; a Studio that found no group says that.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { newEndpoint } from "../src/generate/new-endpoint";
import { StudioTokenRefusal, TOKEN_NEEDED } from "../src/studio/studio-token-refusal";
import { asked, shown } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const project = { root: "/work/shop", name: "shop", workspace: "/work" };

beforeEach(() => {
  asked.errors.length = 0;
  shown.infos.length = 0;
});

describe("New Endpoint", () => {
  it("says the project's token is needed when Studio refuses the groups for want of it", async () => {
    await newEndpoint({
      studioFor: async () => undefined,
      targets: async () => [{ project, studio: STUDIO }],
      fetchGroups: async () => {
        throw new StudioTokenRefusal();
      },
    });

    expect(asked.errors).toEqual([TOKEN_NEEDED]);
    expect(shown.infos).toEqual([]);
  });

  it("says the project writes no group when Studio found none", async () => {
    await newEndpoint({
      studioFor: async () => undefined,
      targets: async () => [{ project, studio: STUDIO }],
      fetchGroups: async () => [],
    });

    expect(shown.infos).toEqual([
      "Courier Studio found no group whose endpoints a file of the project writes.",
    ]);
    expect(asked.errors).toEqual([]);
  });
});
