import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import type { FormBodyField } from "@/features/playground/form-body";
import type { InputCheck } from "@/features/playground/input-check";
import type { ProxyRoute } from "@/features/playground/proxy-route";
import type { UrlPart } from "@/features/playground/request-url";
import { cn } from "@/lib/utils";
import { CodeEditor } from "./code-editor";
import type { CopyChoice } from "./copy-as-menu";
import { CopyAsMenu } from "./copy-as-menu";
import { FormEditor } from "./form-editor";
import { SchemaTable } from "./schema-table";
import { UrlBar } from "./url-bar";

export type EditorTab = "variables" | "headers";
export type BodyKind = "json" | "form";

const CHECK_LOOK = {
  ok: { icon: CircleCheck, className: "text-ok" },
  warn: { icon: TriangleAlert, className: "text-warn" },
  err: { icon: CircleX, className: "text-err" },
} as const;

const BODY_KINDS: readonly SegmentedOption<BodyKind>[] = [
  { value: "json", label: "JSON" },
  { value: "form", label: "Form" },
];

const TEXT_BUTTON =
  "h-6.5 cursor-pointer rounded-[6px] px-2.25 text-small text-fg-subtle hover:bg-raised hover:text-fg";

/** One of the two editors: its text, whether it was changed, and what edits and resets it. */
export interface EditorText {
  text: string;
  changed: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}

interface RequestPaneProps {
  endpoint: PlaygroundEndpoint;
  url: { parts: readonly UrlPart[]; proxy: ProxyRoute | null | undefined };
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
  variables: EditorText;
  headers: EditorText;
  body: {
    kind: BodyKind;
    onKind: (kind: BodyKind) => void;
    fields: readonly FormBodyField[];
    onFields: (fields: FormBodyField[]) => void;
  };
  check: InputCheck;
  onPrettify: () => void;
  onCopy: (choice: CopyChoice, label: string) => void;
}

/**
 * The request half of the Playground: copying the call as code, its URL,
 * the Variables (Params for a stream) and Headers editors — or the body as
 * a form — with the editor's status, and the endpoint's input schema.
 *
 * @param props - The endpoint, its URL, the editors and their status, and what the buttons do
 * @returns The pane
 * @example
 * ```tsx
 * <RequestPane endpoint={endpoint} url={url} tab="variables" onTab={setTab} {...editors} />
 * ```
 */
export function RequestPane(props: RequestPaneProps): React.ReactNode {
  const { endpoint, url, tab, onTab, variables, headers, body, check, onPrettify, onCopy } = props;
  const asForm = tab === "variables" && body.kind === "form" && endpoint.transport === "http";
  const editor = tab === "variables" ? variables : headers;
  const tabs: SegmentedOption<EditorTab>[] = [
    {
      value: "variables",
      label: endpoint.transport === "http" ? "Variables" : "Params",
      dot: variables.changed,
    },
    { value: "headers", label: "Headers", dot: headers.changed },
  ];
  const look = CHECK_LOOK[check.tone];
  return (
    <section
      aria-label="Request"
      className="flex min-h-0 min-w-0 flex-col border-line max-[900px]:border-b min-[901px]:border-r"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-4.5 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-ui font-semibold">Request</h2>
          <div className="flex-1" />
          <CopyAsMenu transport={endpoint.transport} onCopy={onCopy} />
        </div>
        <UrlBar
          label={endpoint.label}
          parts={url.parts}
          proxy={url.proxy}
          served={endpoint.def.served === true}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Editor" options={tabs} value={tab} onChange={onTab} quiet="subtle" />
          {tab === "variables" && endpoint.transport === "http" && (
            <Segmented
              label="Body"
              options={BODY_KINDS}
              value={body.kind}
              onChange={body.onKind}
              quiet="subtle"
            />
          )}
          <div className="flex-1" />
          {!asForm && (
            <button type="button" onClick={onPrettify} className={TEXT_BUTTON}>
              Prettify
            </button>
          )}
          {!asForm && (
            <button
              type="button"
              onClick={editor.onReset}
              disabled={!editor.changed}
              className={cn(TEXT_BUTTON, "disabled:cursor-default disabled:opacity-50")}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {asForm ? (
          <FormEditor fields={body.fields} onChange={body.onFields} />
        ) : (
          <CodeEditor
            value={editor.text}
            onChange={editor.onChange}
            label={tab === "variables" ? "Variables" : "Headers"}
          />
        )}
        <div
          role="status"
          className={cn(
            "flex h-8 shrink-0 items-center gap-2 border-t border-line bg-bg-subtle px-4 text-label",
            look.className,
          )}
        >
          <look.icon aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{check.label}</span>
        </div>
        {tab === "variables" && (
          <SchemaTable
            name={[endpoint.group, endpoint.method].filter(Boolean).join(".")}
            fields={endpoint.def.variablesFields}
            declared={endpoint.def.hasVariablesSchema}
          />
        )}
      </div>
    </section>
  );
}
