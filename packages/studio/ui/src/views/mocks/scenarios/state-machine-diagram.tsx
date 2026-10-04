import { ArrowRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

import type { StateTransition } from "@/store/mock-slice";

interface StateMachineDiagramProps {
  initialState?: string | undefined;
  transitions: StateTransition[];
}

export function StateMachineDiagram({
  initialState,
  transitions,
}: StateMachineDiagramProps): React.ReactElement {
  // Collect all unique states preserving order of appearance
  const stateSet = new Set<string>();
  if (initialState) stateSet.add(initialState);
  for (const t of transitions) {
    stateSet.add(t.from);
    stateSet.add(t.to);
  }
  const states = [...stateSet];

  if (states.length === 0) {
    return (
      <div className="px-5 py-3 text-body-xs text-muted-foreground/40 italic">
        No state transitions captured.
      </div>
    );
  }

  return (
    <div className="px-5 pb-4 pt-1 space-y-2">
      {/* State nodes row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {states.map((state, i) => {
          const isInitial = state === initialState;
          const isTerminal = !transitions.some((t) => t.from === state);
          return (
            <div key={state} className="flex items-center gap-1.5">
              <StateNode label={state} isInitial={isInitial} isTerminal={isTerminal} />
              {i < states.length - 1 && (
                <ArrowRight className="size-3 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Transitions */}
      {transitions.length > 0 && (
        <div className="space-y-1 border-t border-border-subtle pt-2">
          {transitions.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: transitions have no stable id
            <TransitionRow key={i} transition={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function StateNode({
  label,
  isInitial,
  isTerminal,
}: {
  label: string;
  isInitial: boolean;
  isTerminal: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-0.5",
        isInitial
          ? "border-violet-500/30 bg-violet-500/8 text-violet-400"
          : isTerminal
            ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-400"
            : "border-border-subtle bg-muted/30 text-muted-foreground/70",
      )}
    >
      {isInitial && <Circle className="size-1.5 fill-violet-400 text-violet-400 shrink-0" />}
      <span className="mono-xs">{label}</span>
    </div>
  );
}

function TransitionRow({ transition }: { transition: StateTransition }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-caption">
      <span className="text-muted-foreground/50 mono-xs">{transition.from}</span>
      <ArrowRight className="size-2.5 text-muted-foreground/30 shrink-0" />
      <span className="text-muted-foreground/70 mono-xs">{transition.to}</span>
      <span className="ml-1 text-muted-foreground/35">via</span>
      <span className="mono-xs text-accent-brand/60">{transition.trigger}</span>
    </div>
  );
}
