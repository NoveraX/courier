/**
 * Studio in a tab of the editor's own: the tab's page frames only the
 * Studio it names and runs only its own script, at the address the editor
 * reaches it by, with its token and the editor's theme in the fragment —
 * and passes the theme on again as it changes; while Studio does not run
 * it says so and offers to start it; and what the page passes on from
 * Studio is read as data — a file by its absolute path at a place from 1,
 * a page by its web address, nothing else.
 */
import { describe, expect, it } from "vitest";

import { frameAddress } from "../src/panel/frame-address";
import { panelHtml } from "../src/panel/panel-html";
import { panelMessage } from "../src/panel/panel-message";

const PAGE = "http://localhost:6280/audit";

describe("the tab's page", () => {
  it("frames only the Studio it names, and runs only its own script", () => {
    const html = panelHtml(
      { kind: "studio", frame: "http://localhost:6280/audit#token=abc", page: PAGE },
      "vscode-webview://x",
    );
    const policy = /content="([^"]+)"/.exec(html)?.[1] ?? "";

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-src http://localhost:6280;");
    expect(policy).toMatch(/script-src 'nonce-[^']+'$/);
    expect(html).toContain('src="http://localhost:6280/audit#token=abc"');
  });

  it("loads the page at the address the editor reaches Studio by, the token and the theme in the fragment", () => {
    const local = "http://localhost:6280";

    expect(frameAddress(`${local}/timeline?req=r7`, local, `${local}/`, "abc", "light")).toBe(
      "http://localhost:6280/timeline?req=r7#token=abc&theme=light",
    );
    expect(frameAddress(local, local, "https://forwarded.example/", undefined, "dark")).toBe(
      "https://forwarded.example/#theme=dark",
    );
  });

  it("passes the editor's theme on to Studio as it changes", () => {
    const html = panelHtml(
      { kind: "studio", frame: "http://localhost:6280/#theme=dark", page: PAGE },
      "vscode-webview://x",
    );

    expect(html).toContain('attributeFilter: ["data-vscode-theme-kind"]');
    expect(html).toContain('type: "theme"');
  });

  it("says Studio is not running and offers to start it, framing nothing", () => {
    const html = panelHtml({ kind: "stopped", page: PAGE }, "vscode-webview://x");

    expect(html).toContain("frame-src 'none'");
    expect(html).toContain('data-command="courier.startStudio"');
    expect(html).not.toContain("<iframe");
  });

  it("writes what it names into its attributes as text", () => {
    const html = panelHtml(
      { kind: "stopped", page: 'http://localhost:6280/"><script>alert(1)</script>' },
      "vscode-webview://x",
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&#34;&#62;&#60;script&#62;");
  });
});

describe("what the tab's page passes on", () => {
  it("opens a file by its absolute path at a place from 1, and nothing else as a file", () => {
    const file = { type: "open-file", path: "/work/shop/src/cart.ts", line: 12, column: 9 };

    expect(panelMessage({ source: "courier-studio", ...file })).toEqual(file);
    expect(panelMessage({ ...file, path: "src/cart.ts" })).toBeUndefined();
    expect(panelMessage({ ...file, line: 0 })).toBeUndefined();
    expect(panelMessage({ ...file, column: 1.5 })).toBeUndefined();
  });

  it("opens a page by its web address only", () => {
    expect(panelMessage({ type: "open-external", url: "https://courier.noverax.cloud" })).toEqual({
      type: "open-external",
      url: "https://courier.noverax.cloud",
    });
    expect(panelMessage({ type: "open-external", url: "file:///etc/hosts" })).toBeUndefined();
    expect(
      panelMessage({ type: "open-external", url: "command:workbench.action.quit" }),
    ).toBeUndefined();
  });

  it("reads anything else as no message", () => {
    expect(panelMessage("open-file")).toBeUndefined();
    expect(panelMessage({ type: "run", command: "rm -rf" })).toBeUndefined();
    expect(panelMessage(null)).toBeUndefined();
  });
});
