import { Segmented } from "@/design/segmented";
import { optionsWith } from "@/features/mocks/preset-options";
import { withUploadRule } from "@/features/mocks/route-override-rules";
import { SIZE_LIMITS, sizeLimitLabel } from "@/features/mocks/upload-conditions";
import type { RouteOverride } from "@/store/mock-slice";
import { TypesField } from "./types-field";

const GLOBAL = 0;

interface RouteUploadRowsProps {
  override: RouteOverride;
  onCommit: (override: RouteOverride) => void;
}

/**
 * A route's own upload rules: the largest upload it takes, answering a
 * larger one 413, and the types of file it takes, answering another 415 —
 * each `Global`, or left empty, to keep the mock's own.
 *
 * @param props - The route's override, and what follows a change
 * @returns The rows
 * @example
 * ```tsx
 * <RouteUploadRows override={override} onCommit={send} />
 * ```
 */
export function RouteUploadRows({ override, onCommit }: RouteUploadRowsProps): React.ReactNode {
  const limit = override.uploads?.maxBytes ?? GLOBAL;
  const presets = SIZE_LIMITS.filter((bytes) => bytes > 0);
  return (
    <>
      <div className="grid grid-cols-[72px_minmax(0,1fr)_24px] items-center gap-3 @max-[30rem]:grid-cols-[72px_minmax(0,1fr)]">
        <span className="text-small text-fg-subtle">Size limit</span>
        <div className="scroll-row min-w-0">
          <Segmented
            label="Route size limit"
            quiet="subtle"
            options={optionsWith([GLOBAL, ...presets], limit, (bytes) =>
              bytes === GLOBAL ? "Global" : sizeLimitLabel(bytes),
            )}
            value={String(limit)}
            onChange={(bytes) =>
              onCommit(
                withUploadRule(
                  override,
                  "maxBytes",
                  Number(bytes) === GLOBAL ? undefined : Number(bytes),
                ),
              )
            }
          />
        </div>
        <span className="@max-[30rem]:hidden" />
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)_24px] items-center gap-3 @max-[30rem]:grid-cols-[72px_minmax(0,1fr)]">
        <span className="text-small text-fg-subtle">File types</span>
        <TypesField
          label="Route file types"
          placeholder="global"
          value={override.uploads?.accept}
          onCommit={(types) =>
            onCommit(withUploadRule(override, "accept", types.length > 0 ? types : undefined))
          }
        />
        <span className="@max-[30rem]:hidden" />
      </div>
    </>
  );
}
