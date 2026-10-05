import { useEffect, useRef } from "react";
import type { GeneratedFile } from "@/features/apis/types";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import { FilePlanSections } from "../file-plan-sections";
import { FilesPreview } from "../files-preview";

interface FilesStepProps {
  files: readonly GeneratedFile[];
  sourceName: string;
  error: string | null;
  consent: PlanConsent | null;
  onToggleConfirmed: (path: string) => void;
}

/**
 * The Preview step: the files Studio generated for the source, and — when a
 * write was refused — why, with its plan for the files the write touches.
 *
 * @param props - The files, the source's name, Studio's error, its plan, and what allowing a change does
 * @returns The step
 * @example
 * ```tsx
 * <FilesStep files={files} sourceName="billing" error={null} consent={null} onToggleConfirmed={toggle} />
 * ```
 */
export function FilesStep({
  files,
  sourceName,
  error,
  consent,
  onToggleConfirmed,
}: FilesStepProps): React.ReactNode {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) alert.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-title font-semibold">Preview the generated code</h3>
        <p className="m-0 text-small text-fg-subtle">
          Studio generates {files.length} file{files.length === 1 ? "" : "s"} for{" "}
          <span className="font-mono text-fg">{sourceName}</span>.
        </p>
      </div>
      {error && (
        <p
          ref={alert}
          role="alert"
          className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err"
        >
          {error}
        </p>
      )}
      {consent && (
        <FilePlanSections
          plan={consent.plan}
          confirmed={consent.confirmed}
          onToggle={onToggleConfirmed}
        />
      )}
      <FilesPreview files={files} />
    </div>
  );
}
