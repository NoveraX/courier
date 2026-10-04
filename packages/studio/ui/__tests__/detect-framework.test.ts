/**
 * The setup tells the project's framework from the packages it depends on:
 * the most specific framework first, and Vite named when it builds with it.
 */
import { describe, expect, it } from "vitest";

import { detectFramework } from "@/features/welcome/detect-framework";
import { FRAMEWORKS } from "@/features/welcome/frameworks";

describe("detectFramework", () => {
  it("tells React built with Vite, as the setup names it", () => {
    expect(detectFramework(["react", "react-dom", "vite"])).toEqual({
      id: "react",
      label: "vite · react",
    });
  });

  it("prefers the meta-framework to the library it builds on", () => {
    expect(detectFramework(["next", "react", "react-dom"])).toEqual({
      id: "nextjs",
      label: "next",
    });
    expect(detectFramework(["nuxt", "vue"])?.id).toBe("nuxt");
    expect(detectFramework(["@sveltejs/kit", "svelte", "vite"])).toEqual({
      id: "sveltekit",
      label: "vite · @sveltejs/kit",
    });
    expect(detectFramework(["@react-router/dev", "react", "vite"])?.id).toBe("remix");
    expect(detectFramework(["@solidjs/start", "solid-js", "vinxi"])?.id).toBe("solid");
  });

  it("tells nothing from packages that point to no framework of the setup", () => {
    expect(detectFramework([])).toBeNull();
    expect(detectFramework(["express", "vite", "svelte"])).toBeNull();
  });

  it("only ever names a framework the setup offers", () => {
    const ids = new Set(FRAMEWORKS.map((f) => f.id));
    const every = ["next", "nuxt", "@sveltejs/kit", "@remix-run/dev", "astro", "@angular/core"];
    const more = ["@solidjs/start", "vue", "react"];

    for (const name of [...every, ...more]) {
      expect(ids.has(detectFramework([name])?.id ?? "")).toBe(true);
    }
  });
});
