import { Fragment } from "react";

import type { EnvironmentLine, SessionEnvironment } from "@/features/sessions/session-environment";
import { environmentLines } from "@/features/sessions/session-environment";

const GROUPS: readonly EnvironmentLine["group"][] = ["Runtime", "Packages", "Definitions"];

interface EnvironmentListProps {
  environment: SessionEnvironment;
  /** The environment it is set beside: each line that differs says what this one has. */
  other?: SessionEnvironment | undefined;
  /** What the other environment is called beside a line that differs. */
  otherLabel?: string;
}

/**
 * An environment line by line — Studio, Node.js and the platform, each
 * package's version, each source's definition fingerprint — with, beside
 * each line that differs from the environment it is set beside, what that
 * one has instead.
 *
 * @param props - The environment, and the one it is compared with
 * @returns The list
 * @example
 * ```tsx
 * <EnvironmentList environment={recorded} other={mine} otherLabel="yours" />
 * ```
 */
export function EnvironmentList({
  environment,
  other,
  otherLabel = "yours",
}: EnvironmentListProps): React.ReactNode {
  const lines = environmentLines(environment, other);
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-x-5 gap-y-1.25">
      {GROUPS.map((group) => {
        const rows = lines.filter((line) => line.group === group);
        if (rows.length === 0) return null;
        return (
          <Fragment key={group}>
            <dt className="col-span-2 mt-1.5 text-caption text-fg-subtle first:mt-0">{group}</dt>
            {rows.map((line) => (
              <Fragment key={`${group}:${line.name}`}>
                <dt className="truncate font-mono text-small text-fg-muted">{line.name}</dt>
                <dd className="m-0 flex min-w-0 items-center gap-2 font-mono text-small">
                  <span className="truncate">{line.value}</span>
                  {line.other !== undefined && (
                    <span className="shrink-0 rounded-chip bg-warn-dim px-1.5 py-px text-badge text-warn">
                      {otherLabel}: {line.other}
                    </span>
                  )}
                </dd>
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </dl>
  );
}
