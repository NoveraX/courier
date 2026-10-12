import { X } from "lucide-react";

import { faultLook } from "@/features/mocks/fault-catalogue";
import { AddFaultMenu } from "./add-fault-menu";

interface RouteFaultsRowProps {
  /** The faults the route fails with of its own; none leaves it to the mix. */
  faults: readonly string[];
  onFaults: (faults: string[]) => void;
}

/**
 * The faults a route fails with in place of the mock's mix — each a chip
 * that takes it out again, and a menu that adds another. With none, the
 * route fails as the mix says.
 *
 * @param props - The route's faults, and what changes them
 * @returns The row
 * @example
 * ```tsx
 * <RouteFaultsRow faults={["413"]} onFaults={(faults) => send(withFaults(override, faults, rate))} />
 * ```
 */
export function RouteFaultsRow({ faults, onFaults }: RouteFaultsRowProps): React.ReactNode {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_24px] items-center gap-3 @max-[30rem]:grid-cols-[72px_minmax(0,1fr)]">
      <span className="text-small text-fg-subtle">Fails with</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {faults.length === 0 && (
          <span className="font-mono text-small text-fg-subtle">global mix</span>
        )}
        {faults.map((type) => {
          const look = faultLook(type);
          return (
            <span
              key={type}
              title={look.sub}
              className="flex h-6 items-center gap-0.5 rounded-[6px] border border-line bg-panel pr-0.5 pl-2 font-mono text-small"
            >
              {look.label}
              <button
                type="button"
                aria-label={`Take ${look.label} out`}
                onClick={() => onFaults(faults.filter((other) => other !== type))}
                className="hit-area relative flex size-5 cursor-pointer items-center justify-center rounded-[4px] text-fg-subtle hover:bg-raised hover:text-fg"
              >
                <X aria-hidden="true" className="size-2.75" />
              </button>
            </span>
          );
        })}
        <AddFaultMenu
          taken={faults}
          label={faults.length === 0 ? "Pick faults" : "Add"}
          onAdd={(type) => onFaults([...faults, type])}
        />
      </div>
      <span className="@max-[30rem]:hidden" />
    </div>
  );
}
