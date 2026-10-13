import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { MEDIA } from "@/design/breakpoints";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { fieldsWithDefaults } from "@/features/playground/defaulted-fields";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import type { FormBodyField } from "@/features/playground/form-body";
import type { InputCheck } from "@/features/playground/input-check";
import type { ProxyRoute } from "@/features/playground/proxy-route";
import type { UrlPart } from "@/features/playground/request-url";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { CodeEditor } from "./code-editor";
import type { CopyChoice } from "./copy-as-menu";
import { CopyAsMenu } from "./copy-as-menu";
import { EditorActions } from "./editor-actions";
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
 * a form — with the editor's status, and the endpoint's input schema. On a
 * phone Prettify and Reset join the pane's title, leaving the editor's
 * choices a row of their own.
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
      changed: variables.changed,
    },
    { value: "headers", label: "Headers", changed: headers.changed },
  ];
  const look = CHECK_LOOK[check.tone];
  const phone = useMediaQuery(MEDIA.phone);
  const actions = asForm ? null : (
    <EditorActions changed={editor.changed} onPrettify={onPrettify} onReset={editor.onReset} />
  );
  return (
    <section
      aria-label="Request"
      className="flex min-h-0 min-w-0 flex-col border-line max-[900px]:border-b min-[901px]:border-r"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-4.5 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-ui font-semibold">Request</h2>
          <div className="flex-1" />
          {phone && actions}
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
          {!phone && <div className="flex-1" />}
          {!phone && actions}
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
            fields={fieldsWithDefaults(
              endpoint.def.variablesFields,
              endpoint.def.variablesDefaults,
            )}
            declared={endpoint.def.hasVariablesSchema}
          />
        )}
      </div>
    </section>
  );
}
