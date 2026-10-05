import { readKeptImport, useKeptImport } from "@/apis/kept-import";
import { readKeptWizard } from "@/features/mocks/wizard/kept-wizard";
import { useSetupStore } from "@/features/welcome/setup-store";
import { markWelcomeCompleted } from "@/features/welcome/welcome-storage";
import { browserStorage } from "@/lib/browser-storage";
import { useKeptWizard } from "@/mocks/wizard/kept-wizard-store";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/store/constants";
import { storedSettings } from "@/store/stored-settings";
import { isPlainObject } from "./is-plain-object";

/** What a page keeps in the project, each under its own name. */
export const PAGE_STATE_KEYS = [
  "settings",
  "setup",
  "playground.drafts",
  "mocks.wizard",
  "apis.import",
] as const;

export type PageStateKey = (typeof PAGE_STATE_KEYS)[number];

const isText = (value: unknown): value is string => typeof value === "string";

function textRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => isText(entry[1])),
  );
}

/**
 * This page's own value under a name, to send the project — or `undefined`
 * when the page has none worth keeping: nothing set, nothing picked, nothing
 * typed. A project with none takes the first page's that has one.
 *
 * @param key - The name
 * @returns The value, as the project keeps it
 * @example
 * ```ts
 * socket.emit("page:state:set", { key: "settings", value: ownValue("settings") });
 * ```
 */
export function ownValue(key: PageStateKey, seeding = false): unknown {
  if (key === "settings") {
    const stored = browserStorage.read(SETTINGS_STORAGE_KEY) !== null;
    return seeding && !stored ? undefined : useStudioStore.getState().settings;
  }
  if (key === "setup") {
    const { frameworkId, copied, completed } = useSetupStore.getState();
    if (seeding && frameworkId === null && !completed) return undefined;
    return { frameworkId, copied: [...copied], completed };
  }
  if (key === "apis.import") {
    const { kept } = useKeptImport.getState();
    if (seeding && kept === null) return undefined;
    return kept ?? {};
  }
  if (key === "mocks.wizard") {
    const { kept } = useKeptWizard.getState();
    if (seeding && kept === null) return undefined;
    return kept ?? {};
  }
  const { variables, headers, mode } = usePlaygroundDrafts.getState();
  if (seeding && Object.keys(variables).length === 0 && headers === undefined) return undefined;
  return { variables, ...(headers !== undefined && { headers }), mode };
}

/**
 * Take a value the project keeps under a name, read for its shape, into
 * this page: its settings, Get started's progress, the Playground's drafts.
 *
 * @param key - The name, as Studio sent it
 * @param value - The value, as Studio sent it
 * @example
 * ```ts
 * applyValue("settings", { theme: "light" });
 * ```
 */
export function applyValue(key: unknown, value: unknown): void {
  if (key === "settings") {
    useStudioStore.getState().updateSettings(storedSettings(value, DEFAULT_SETTINGS));
  } else if (key === "setup" && isPlainObject(value)) {
    const completed = value.completed === true;
    if (completed) markWelcomeCompleted();
    useSetupStore.setState({
      frameworkId: isText(value.frameworkId) ? value.frameworkId : null,
      copied: new Set(Array.isArray(value.copied) ? value.copied.filter(isText) : []),
      completed,
    });
  } else if (key === "apis.import") {
    useKeptImport.setState({ kept: readKeptImport(value) });
  } else if (key === "mocks.wizard") {
    useKeptWizard.setState({ kept: readKeptWizard(value) ?? null });
  } else if (key === "playground.drafts" && isPlainObject(value)) {
    usePlaygroundDrafts.setState({
      variables: textRecord(value.variables),
      headers: isText(value.headers) ? value.headers : undefined,
      mode: value.mode === "proxy" ? "proxy" : "direct",
    });
  }
}
