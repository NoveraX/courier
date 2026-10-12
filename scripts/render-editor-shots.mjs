#!/usr/bin/env node
/// <reference types="node" />
/**
 * Photograph the Courier extension at work in VS Code, for its docs page,
 * its README and its walkthrough, each in a light and a dark theme at
 * twice its size, into `docs/public/images/vscode/`: the figures above the
 * calls in the demo shop's `src/traffic/visit.ts` and at the end of their
 * lines, the hover over one, the Courier view with the checkout's endpoint
 * open at its call, the Requests and Mocks views, Studio in a tab beside
 * the code, `@courier` answering in the chat, and Courier's icons in
 * vscode-icons — the shots the walkthrough shows into the extension's
 * `media/walkthrough/` too.
 *
 * It needs VS Code — `VSCODE_PATH` and `VSCODE_CLI` name its program and its
 * command line, macOS's places by default — both extensions packaged, with
 * `npm run package -w courier-file-icons` and `npm run package -w
 * courier-vscode`, and Studio running for the demo shop
 * as a project's own Studio, its traffic flowing, at `STUDIO_PORT` (6280 by
 * default). `npm run demo` serves a public demo, which writes no address
 * file for an editor to find, so start the parts in examples/demo-shop
 * instead: `npm run upstream`, `npx @noverax/courier-studio`, `npm run app`
 * and `npm run traffic`, each on the ports its environment names (see
 * src/ports.ts). The icons' shot takes a copy of the vscode-icons your own
 * VS Code has installed, or the one `VSICONS_PATH` names, and is left out
 * without one.
 *
 * VS Code runs in profiles of its own, the extension installed there from
 * its .vsix, so the editor you work in is left alone. `SHOTS` names the
 * shots to take again — `SHOTS=inlay,chat` — and the rest are left as they are.
 */

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import {
  hoverPlace,
  openLiveViews,
  openStudioTab,
  openView,
  openVisit,
  restPointer,
} from "./editor-shots/editor-scenes.mjs";
import {
  askCourier,
  explorerPart,
  LOCAL_MODEL,
  takeIconOffer,
  vsiconsCopy,
} from "./editor-shots/extra-scenes.mjs";
import {
  OUT,
  openEditor,
  profileFor,
  STUDIO,
  shoot,
  THEMES,
  WALKTHROUGH,
} from "./editor-shots/vscode.mjs";

const SIZE = { width: 940, height: 620 };
/* The views beside the editor, and the figures at the end of the lines, need the room of both. */
const WIDE = { width: 1180, height: 700 };
const STUDIO_SIZE = { width: 1440, height: 800 };
const CHAT_SIZE = { width: 1180, height: 860 };
const KEYS = [
  { key: "ctrl+alt+1", command: "workbench.action.splitEditorRight" },
  {
    key: "ctrl+alt+2",
    command: "courier.openStudioPage",
    args: `${STUDIO}/explorer/endpoints?endpoint=shop.orders.place`,
  },
  {
    key: "ctrl+alt+3",
    command: "workbench.action.chat.open",
    args: {
      query: "@courier /endpoint shop.orders.place",
      modelSelector: { vendor: "courier-shots", id: "local" },
    },
  },
];
const WALKED = ["hover", "view", "live", "studio-tab", "chat", "icons"];
const ONLY = env.SHOTS ? new Set(env.SHOTS.split(",")) : undefined;
/* Whether any of these shots is to be taken. */
const wanted = (...shots) => !ONLY || shots.some((shot) => ONLY.has(shot));

/* One editor's shots, the editor closed after them. */
async function inEditor(profile, size, develop, shots) {
  const { app, page } = await openEditor(profile, size, develop);
  try {
    await shots(page, (bounds) =>
      app.evaluate(({ BrowserWindow }, next) => {
        BrowserWindow.getAllWindows()[0]?.setBounds({ x: 40, y: 40, ...next });
      }, bounds),
    );
  } finally {
    await app.close();
  }
}

mkdirSync(OUT, { recursive: true });
for (const { name, theme } of THEMES) {
  const plain = profileFor(theme, undefined, KEYS);
  const inlay = profileFor(theme, () => ({ "courier.hints.style": "inlay" }), KEYS);
  const extras = profileFor(
    theme,
    (root) => ({
      "chat.disableAIFeatures": false,
      "workbench.iconTheme": "vscode-icons",
      "vsicons.customIconFolderPath": join(root, "icons-home"),
      "vsicons.dontShowNewVersionMessage": true,
    }),
    KEYS,
  );
  const vsicons = vsiconsCopy(extras.root);
  const develop = [LOCAL_MODEL, ...(vsicons ? [vsicons] : [])];
  try {
    if (wanted("lens", "hover", "view", "live"))
      await inEditor(plain, SIZE, [], async (page, resize) => {
        await openVisit(page);
        await restPointer(page);
        if (wanted("lens")) await shoot(page, `lens-${name}`);
        await hoverPlace(page);
        if (wanted("hover")) await shoot(page, `hover-${name}`);
        await resize(WIDE);
        await openView(page, WIDE.height);
        if (wanted("view")) await shoot(page, `view-${name}`);
        if (!wanted("live")) return;
        await openLiveViews(page);
        await shoot(page, `live-${name}`);
      });
    if (wanted("inlay", "studio-tab"))
      await inEditor(inlay, STUDIO_SIZE, [], async (page) => {
        await openVisit(page, "inlay");
        await restPointer(page);
        if (wanted("inlay")) await shoot(page, `inlay-${name}`);
        if (!wanted("studio-tab")) return;
        await openStudioTab(page);
        await shoot(page, `studio-tab-${name}`);
      });
    if (vsicons && wanted("icons")) await inEditor(extras, WIDE, develop, takeIconOffer);
    if (wanted("icons", "chat"))
      await inEditor(extras, CHAT_SIZE, develop, async (page) => {
        if (vsicons && wanted("icons"))
          await shoot(page, `icons-${name}`, await explorerPart(page));
        if (wanted("chat")) await shoot(page, `chat-${name}`, await askCourier(page));
      });
    for (const shot of WALKED.filter((each) => wanted(each))) {
      if (shot !== "icons" || vsicons)
        copyFileSync(join(OUT, `${shot}-${name}.png`), join(WALKTHROUGH, `${shot}-${name}.png`));
    }
  } finally {
    for (const { root } of [plain, inlay, extras]) rmSync(root, { recursive: true, force: true });
  }
}
