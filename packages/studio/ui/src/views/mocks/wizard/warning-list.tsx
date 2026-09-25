import { AlertTriangle } from "lucide-react";

/**
 * What Studio says the edit changes beside the diff, one line each.
 *
 * @param props.warnings - Studio's warnings, shown as sent
 * @returns The list, or nothing when there are none
 *
 * @example
 * ```tsx
 * <WarningList warnings={plan.warnings} />
 * ```
 */
export function WarningList({ warnings }: { warnings: readonly string[] }): React.ReactElement | null {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
      {warnings.map((warning, index) => (
        <li key={`${index}:${warning}`} className="flex items-start gap-2 text-body-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  );
}
