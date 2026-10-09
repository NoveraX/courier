import { indentUnit } from "../../edit/insert";
import type { RecipeEdit } from "../recipe-types";

/* A block of lines at an indentation. */
function block(indent: string, lines: readonly string[], unit: string): string {
  return lines.map((line) => `${indent}${line.replaceAll("\t", unit)}`).join("\n");
}

/* The native tabs with Courier's in them, before the list closes: the one closing tag there is. */
function withNativeTab(text: string): string | undefined {
  if (text.includes('name="courier"')) return text;
  const closings = [...text.matchAll(/^([ \t]*)<\/NativeTabs>/gm)];
  const closing = closings[0];
  if (closings.length !== 1 || closing === undefined) return undefined;
  const unit = indentUnit(text);
  const tab = block(
    `${closing[1] ?? ""}${unit}`,
    [
      '<NativeTabs.Trigger name="courier">',
      "\t<NativeTabs.Trigger.Label>Courier</NativeTabs.Trigger.Label>",
      '\t<NativeTabs.Trigger.Icon sf="network" md="hub" />',
      "</NativeTabs.Trigger>",
    ],
    unit,
  );
  return `${text.slice(0, closing.index)}\n${tab}\n${text.slice(closing.index)}`;
}

/* The web tabs with Courier's after the last of theirs. */
function withWebTab(text: string): string | undefined {
  if (text.includes('name="courier"')) return text;
  const list = text.indexOf("</TabList>");
  const last = text.lastIndexOf("</TabTrigger>", list);
  if (list === -1 || last === -1 || text.indexOf("</TabList>", list + 1) !== -1) return undefined;
  const lineStart = text.lastIndexOf("\n", last) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
  const end = text.indexOf("\n", last);
  const unit = indentUnit(text);
  const tab = block(
    indent,
    [
      '<TabTrigger name="courier" href="/courier" asChild>',
      "\t<TabButton>Courier</TabButton>",
      "</TabTrigger>",
    ],
    unit,
  );
  return `${text.slice(0, end)}\n${tab}${text.slice(end)}`;
}

/**
 * Where an Expo app's root layout is Expo's tabs — the default template's,
 * which list their tabs by name — the edits that add a Courier tab, so the
 * screen that shows Courier at work can be reached: one for the native
 * tabs, one for the web's.
 *
 * @param nativeTabs - The file the native tabs are in
 * @param webTabs - The file the web's tabs are in
 * @returns The two edits
 * @example
 * ```ts
 * expoTabEdits("src/components/app-tabs.tsx", "src/components/app-tabs.web.tsx");
 * ```
 */
export function expoTabEdits(nativeTabs: string, webTabs: string): RecipeEdit[] {
  const what = "Add a tab for the screen that shows Courier at work, or link to /courier";
  return [
    {
      path: nativeTabs,
      purpose: "adds a Courier tab to the app",
      change: withNativeTab,
      manual: {
        file: nativeTabs,
        what,
        lines: ['<NativeTabs.Trigger name="courier">…</NativeTabs.Trigger>'],
      },
    },
    {
      path: webTabs,
      purpose: "adds the Courier tab on the web",
      change: withWebTab,
      manual: {
        file: webTabs,
        what,
        lines: ['<TabTrigger name="courier" href="/courier" asChild>…</TabTrigger>'],
      },
    },
  ];
}
