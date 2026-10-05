import { Code, Send, Terminal } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import type { SegmentedOption } from "@/design/segmented";
import { requestBodyFile } from "@/features/requests/request-body-file";
import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { requestSnippet, snippetLabels } from "@/features/requests/request-snippets";
import { copyToClipboard } from "@/lib/clipboard";
import type { RequestEntry } from "@/store/types";
import { CodeToolbar } from "./code-toolbar";
import { CutNote } from "./cut-note";

const ICONS = { shell: Terminal, browser: Code, courier: Send } as const;

interface SnippetsTabProps {
  request: RequestEntry;
  flavor: SnippetFlavor;
  onFlavor: (flavor: SnippetFlavor) => void;
  /** Downloads the request's whole body, which the snippet sends from a file when it is too large to write out. */
  onWhole?: (() => void) | undefined;
}

/**
 * The request written out as a shell command, browser code or a Courier
 * call, with credentials left out.
 *
 * @param props - The request, the flavour shown, and what changes it
 * @returns The tab
 * @example
 * ```tsx
 * <SnippetsTab request={request} flavor={flavor} onFlavor={setFlavor} />
 * ```
 */
export function SnippetsTab({
  request,
  flavor,
  onFlavor,
  onWhole,
}: SnippetsTabProps): React.ReactNode {
  const labels = snippetLabels(request);
  const modes: SegmentedOption<SnippetFlavor>[] = (["shell", "browser", "courier"] as const).map(
    (value) => ({
      value,
      label: labels[value],
      icon: ICONS[value],
    }),
  );
  const snippet = requestSnippet(request, flavor);
  return (
    <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <CodeToolbar
        label="Snippet"
        modes={modes}
        mode={flavor}
        onMode={onFlavor}
        chips={snippet.redacted ? [{ label: "credentials redacted", tone: "muted" }] : []}
        onCopy={() => void copyToClipboard(snippet.code, "the snippet")}
      />
      {request.variablesCutFrom !== undefined && (
        <CutNote
          bytes={request.variablesCutFrom}
          file={requestBodyFile(request, "request")}
          onWhole={onWhole}
        />
      )}
      <div className="overflow-hidden rounded-panel border border-line bg-inset">
        <CodeLines variant="panel" code={snippet.code} />
      </div>
    </div>
  );
}
