import { CodeLines } from "@/design/code/code-lines";
import type { MockRequestView } from "@/features/mocks/mock-request-view";
import { copyToClipboard } from "@/lib/clipboard";
import { CodeToolbar } from "./code-toolbar";
import { CutNote } from "./cut-note";

const CURL_MODES = [{ value: "curl", label: "cURL" }] as const;

interface MockCurlTabProps {
  view: MockRequestView;
  /** The size in bytes of the request's whole body, when the event carried a part of it. */
  bodyBytes: number | undefined;
  /** Downloads the request's whole body. */
  onWhole: () => void;
}

/**
 * The cURL that sends a request the mock logged to it again — credentials
 * left out — and, for a body too large to write out, the file it reads the
 * body from and a way to download it.
 *
 * @param props - The request's view, its whole body's size, and what downloads it
 * @returns The tab
 * @example
 * ```tsx
 * <MockCurlTab view={view} bodyBytes={log.variablesCutFrom} onWhole={download} />
 * ```
 */
export function MockCurlTab({ view, bodyBytes, onWhole }: MockCurlTabProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <CodeToolbar
        label="Snippet"
        modes={CURL_MODES}
        mode="curl"
        onMode={() => {}}
        chips={view.redacted ? [{ label: "credentials redacted", tone: "muted" }] : []}
        onCopy={() => void copyToClipboard(view.curl, "the snippet")}
      />
      {view.bodyFile !== undefined && bodyBytes !== undefined && (
        <CutNote bytes={bodyBytes} file={view.bodyFile} onWhole={onWhole} />
      )}
      <div className="overflow-hidden rounded-panel border border-line bg-inset">
        <CodeLines variant="panel" code={view.curl} />
      </div>
    </div>
  );
}
