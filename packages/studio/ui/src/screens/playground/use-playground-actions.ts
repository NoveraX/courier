import { toast } from "sonner";

import { endpointKey } from "@/features/explorer/endpoint-key";
import { draftSnippet } from "@/features/playground/draft-snippet";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import { parseJsonc } from "@/features/playground/jsonc-helpers";
import { requestUrlParts } from "@/features/playground/request-url";
import { readRequestValues } from "@/features/playground/request-values";
import { copyToClipboard } from "@/lib/clipboard";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { CopyChoice } from "./copy-as-menu";
import type { EditorTab } from "./request-pane";
import type { ResponseTab } from "./response-content";
import type { PlaygroundEditors } from "./use-playground-editors";

interface ActionsInput {
  endpoint: PlaygroundEndpoint;
  editors: PlaygroundEditors;
  tab: EditorTab;
  choices: readonly PlaygroundEndpoint[];
  onChoose: (endpoint: PlaygroundEndpoint) => void;
  onShow: (tab: ResponseTab) => void;
}

/** What the Playground's smaller controls do. */
export interface PlaygroundActions {
  prettify: () => void;
  copy: (choice: CopyChoice, label: string) => void;
  restore: (entry: PlaygroundHistoryEntry) => void;
  labelOf: (entry: PlaygroundHistoryEntry) => string;
}

/**
 * Laying the editor's JSON out, copying the call as code or its URL — as
 * the variables fill it — bringing back a recent send — its endpoint, variables, headers, mode and answer — and
 * the method a recent send is listed under.
 *
 * @param input - The endpoint, the editors, the editor shown, the endpoints, and what chooses one and shows a tab
 * @returns The actions
 * @example
 * ```ts
 * const { prettify, copy } = usePlaygroundActions({ endpoint, editors, tab, choices, onChoose, onShow });
 * ```
 */
export function usePlaygroundActions(input: ActionsInput): PlaygroundActions {
  const { endpoint, editors, tab, choices, onChoose, onShow } = input;
  const indent = useStudioStore((s) => s.settings.jsonIndent);
  const setActive = useStudioStore((s) => s.setPlaygroundActiveResponse);
  const choiceOf = (entry: PlaygroundHistoryEntry) =>
    choices.find((c) => c.key === endpointKey(entry));
  return {
    prettify: () => {
      const editor = tab === "variables" ? editors.variables : editors.headers;
      const parsed = parseJsonc(editor.text);
      if (!parsed.ok) return void toast.error("Cannot lay out text that is not valid JSON");
      editor.onChange(JSON.stringify(parsed.value, null, indent));
    },
    copy: (choice, label) => {
      const request = readRequestValues(editors.variables.text, editors.headers.text);
      if (!request.ok) return void toast.error(request.problem);
      const text =
        choice === "url"
          ? requestUrlParts(endpoint, request.values.variables)
              .map((part) => part.text)
              .join("")
          : draftSnippet(endpoint, request.values, choice);
      void copyToClipboard(text, label);
    },
    restore: (entry) => {
      const choice = choiceOf(entry);
      const drafts = usePlaygroundDrafts.getState();
      drafts.setVariables(endpointKey(entry), entry.variables);
      drafts.setHeaders(entry.headers);
      drafts.setMode(entry.mode);
      setActive(entry);
      onShow(entry.transport ? "messages" : "body");
      if (choice) onChoose(choice);
    },
    labelOf: (entry) =>
      choiceOf(entry)?.label ??
      (entry.transport === "ws" ? "WS" : entry.transport === "sse" ? "SSE" : "HTTP"),
  };
}
