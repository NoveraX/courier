import { AlertTriangle } from "lucide-react";

import type { MocksFileStatus } from "@/store/mocks-file-status";

/* The status names the file by its absolute path; the banner names it as the developer does. */
function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Says that the project's `courier.mocks.*` does not load, and why, above
 * every Mocks view — also when no mock is listed, which is what a mocks
 * file that never loaded looks like. The mocks it declared last keep
 * running meanwhile.
 *
 * @param props.status - How the mocks file loads, as Studio last told it
 * @returns The banner, or nothing while the file loads or there is none
 *
 * @example
 * ```tsx
 * const status = useStudioStore((s) => s.mocksFileStatus);
 * <MocksFileBanner status={status} />
 * ```
 */
export function MocksFileBanner({
  status,
}: {
  status: MocksFileStatus | null;
}): React.ReactElement | null {
  if (!status || status.error === null) return null;
  const file = status.file === null ? "courier.mocks.ts" : fileNameOf(status.file);
  return (
    <div
      role="alert"
      className="flex shrink-0 items-start gap-2 border-b border-rose-500/20 bg-rose-500/10 px-3 py-2"
    >
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-rose-400" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-body-sm text-rose-400">
          {file} does not load. Studio keeps serving the mocks it loaded last.
        </p>
        <p className="whitespace-pre-wrap break-words mono-xs text-rose-400/80">{status.error}</p>
      </div>
    </div>
  );
}
