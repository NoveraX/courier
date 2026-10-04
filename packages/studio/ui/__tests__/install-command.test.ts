/**
 * The install step's commands, written for the package manager picked.
 */
import { describe, expect, it } from "vitest";

import { installCommand } from "@/features/welcome/install-command";

const NPM = "npm install @noverax/courier-studio-core\nnpm install -D @noverax/courier-studio";

describe("installCommand", () => {
  it("keeps the npm commands for npm", () => {
    expect(installCommand(NPM, "npm")).toBe(NPM);
  });

  it("writes each line, dev and runtime alike, for pnpm and bun", () => {
    expect(installCommand(NPM, "pnpm")).toBe(
      "pnpm add @noverax/courier-studio-core\npnpm add -D @noverax/courier-studio",
    );
    expect(installCommand(NPM, "bun")).toBe(
      "bun add @noverax/courier-studio-core\nbun add -d @noverax/courier-studio",
    );
  });

  it("leaves a line that is no npm install as it is", () => {
    expect(installCommand("npx courier-studio", "pnpm")).toBe("npx courier-studio");
  });
});
