import { randomBytes } from "node:crypto";

/** What the panel's page shows: Studio in a frame, or why it cannot. */
export type PanelContent =
  | { readonly kind: "studio"; readonly frame: string; readonly page: string }
  | { readonly kind: "stopped"; readonly page: string };

/*
 * The page frames Studio, and passes on what each side tells the other:
 * Studio's requests to open a file or a page, and the page it shows — kept
 * so the tab opens on it again — to the extension; the extension's request
 * to show a page, to Studio, which shows it without loading again. Only
 * Studio's frame is heard as Studio; anything else is the extension.
 */
const SCRIPT = `
const vscode = acquireVsCodeApi();
const frame = document.getElementById("studio");
const page = document.body.dataset.page;
const studio = new URL(page).origin;
const shown = frame && new URL(frame.src).origin;
vscode.setState({ page });
addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (frame && event.source === frame.contentWindow) {
    if (event.origin !== shown || data.source !== "courier-studio") return;
    if (data.type === "location" && typeof data.path === "string") vscode.setState({ page: studio + data.path });
    vscode.postMessage(data);
    return;
  }
  if (frame && data.type === "navigate" && typeof data.path === "string")
    frame.contentWindow.postMessage({ source: "courier-vscode", type: "navigate", path: data.path }, shown);
});
for (const button of document.querySelectorAll("button[data-command]"))
  button.addEventListener("click", () => vscode.postMessage({ source: "courier-panel", type: "command", command: button.dataset.command }));
`;

const STYLE = `
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
iframe { display: block; border: 0; width: 100%; height: 100%; }
main { height: 100%; display: grid; place-content: center; gap: 12px; text-align: center; padding: 0 16px; }
h1 { margin: 0; font-size: 1.15em; font-weight: 600; }
p { margin: 0; color: var(--vscode-descriptionForeground); max-width: 46ch; line-height: 1.5; }
button { justify-self: center; padding: 6px 14px; border: 0; border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
`;

/**
 * The panel's page: Studio in a frame that fills the tab, or — while it
 * does not run — a word on why and a button that starts it. The page runs
 * only its own script, and frames only the Studio it names.
 *
 * @param content - What to show
 * @param cspSource - The webview's own source, for its policy
 * @returns The HTML
 * @example
 * ```ts
 * panel.webview.html = panelHtml({ kind: "studio", frame, page }, panel.webview.cspSource);
 * ```
 */
export function panelHtml(content: PanelContent, cspSource: string): string {
  const nonce = randomBytes(16).toString("base64");
  const frameSource = content.kind === "studio" ? new URL(content.frame).origin : "'none'";
  const policy = [
    "default-src 'none'",
    `frame-src ${frameSource}`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  const body =
    content.kind === "studio"
      ? `<iframe id="studio" title="Courier Studio" src="${escaped(content.frame)}" allow="clipboard-read; clipboard-write"></iframe>`
      : `<main><h1>Courier Studio is not running</h1><p>Start it for this project, and its pages show here: every endpoint, the requests your app made, the audit and the mocks.</p><button type="button" data-command="courier.startStudio">Start Studio</button></main>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<style nonce="${nonce}">${STYLE}</style></head>
<body data-page="${escaped(content.page)}">${body}<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}

function escaped(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
