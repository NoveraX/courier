import { Layers, Loader2, TriangleAlert } from "lucide-react";

import type { UseOpenApiExportReturn } from "@/apis/use-openapi-export";
import { ChoiceMenu } from "@/design/choice-menu";
import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { Segmented } from "@/design/segmented";
import type { OpenApiVersion } from "@/features/apis/openapi-export";

const VERSIONS = [
  { value: "3.1.0", label: "3.1.0" },
  { value: "3.2.0", label: "3.2.0" },
] as const satisfies ReadonlyArray<{ value: OpenApiVersion; label: string }>;

/* A preview shows the start of a large document; the file holds all of it. */
const SHOWN_LINES = 400;

const INPUT =
  "h-8 w-full rounded-card border border-line-strong bg-inset px-2.5 font-mono text-control text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand pointer-coarse:h-10 pointer-coarse:text-[16px]";

/**
 * What the OpenAPI export writes: the source, the OpenAPI version, the
 * document's title and the API's version — and the document written for
 * them, with every endpoint it leaves out and why.
 *
 * @param props - The export's state, and the sources the config declares
 * @returns The form and the document
 * @example
 * ```tsx
 * <ExportOpenApiForm exporter={exporter} sources={["shop", "payments"]} />
 * ```
 */
export function ExportOpenApiForm({
  exporter,
  sources,
}: {
  exporter: UseOpenApiExportReturn;
  sources: readonly string[];
}): React.ReactNode {
  const { request, change, result, writing, error } = exporter;
  const lines = result?.text.split("\n") ?? [];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <ChoiceMenu
          icon={Layers}
          label="Source"
          choices={sources.map((name) => ({ value: name, label: name }))}
          value={request.source}
          onChange={(source) => change({ source })}
        />
        <Segmented
          label="OpenAPI version"
          options={VERSIONS}
          value={request.openapi}
          onChange={(openapi) => change({ openapi })}
          quiet="subtle"
        />
        <span className="text-small text-fg-subtle">
          {request.openapi === "3.2.0"
            ? "writes the QUERY method, a stream's events and groups in groups"
            : "what most tools read"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <label
          htmlFor="openapi-export-title"
          className="flex flex-col gap-1.5 text-label text-fg-muted"
        >
          Title
          <input
            id="openapi-export-title"
            className={INPUT}
            placeholder={request.source}
            value={request.title}
            onChange={(event) => change({ title: event.target.value })}
          />
        </label>
        <label
          htmlFor="openapi-export-version"
          className="flex flex-col gap-1.5 text-label text-fg-muted"
        >
          API version
          <input
            id="openapi-export-version"
            className={INPUT}
            placeholder="0.0.0"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={request.version}
            onChange={(event) => change({ version: event.target.value })}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          {error}
        </p>
      )}
      <p aria-live="polite" className="m-0 flex items-center gap-1.5 text-control text-fg-muted">
        {writing && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
        {writing
          ? "Writing the document…"
          : result && summaryOf(result.operations, result.leftOut.length)}
      </p>
      {result && result.leftOut.length > 0 && (
        <ul aria-label="Left out of the document" className="m-0 flex list-none flex-col gap-1 p-0">
          {result.leftOut.map((one) => (
            <li key={one.operation} className="flex items-start gap-2 text-small text-fg-muted">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-warn" />
              <span>
                <span className="font-mono text-fg">{one.operation}</span> — {one.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result && (
        <div className="max-h-80 overflow-auto rounded-[11px] border border-line bg-inset">
          <CodeLines
            code={lines.slice(0, SHOWN_LINES).join("\n")}
            tokenize={tokenizeJsonLine}
            variant="panel"
          />
          {lines.length > SHOWN_LINES && (
            <p className="m-0 px-3 pb-2.5 text-small text-fg-subtle">
              {`and ${lines.length - SHOWN_LINES} more lines in the file`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function summaryOf(operations: number, leftOut: number): string {
  const written = `${operations} ${operations === 1 ? "operation" : "operations"}`;
  return leftOut === 0 ? written : `${written} · ${leftOut} left out`;
}
