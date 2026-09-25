import { Globe, Server } from "lucide-react";

import type { WizardMode } from "./types";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MODES: { value: WizardMode; label: string; icon: typeof Globe }[] = [
  { value: "sources", label: "From Source", icon: Globe },
  { value: "standalone", label: "Standalone", icon: Server },
];

function StandaloneComingSoon(): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-muted/20 px-4 py-8 text-center">
      <Server className="size-8 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-body-sm font-medium text-foreground">Standalone Mock Server</p>
        <p className="max-w-sm text-body-sm text-muted-foreground">
          Design mock APIs without a source definition — with a visual drag-and-drop builder,
          schema-based data generation, and OpenAPI export.
        </p>
      </div>
      <Badge variant="secondary" className="text-caption">
        Coming soon
      </Badge>
    </div>
  );
}

interface ModeSwitchProps {
  mode: WizardMode;
  onModeChange: (mode: WizardMode) => void;
  /** What the sources mode shows. */
  children: React.ReactNode;
}

/**
 * Choose between mocks of the project's sources and the standalone mock
 * builder, which is not available yet: its mode says so, and the wizard
 * does not go on from it.
 *
 * @param props - The mode, its change handler, and the sources mode's content
 * @returns The switch and the chosen mode's content
 *
 * @example
 * ```tsx
 * <ModeSwitch mode={state.mode} onModeChange={setMode}>
 *   <SourceList />
 * </ModeSwitch>
 * ```
 */
export function ModeSwitch({ mode, onModeChange, children }: ModeSwitchProps): React.ReactElement {
  return (
    <>
      <div className="flex gap-1.5 rounded-lg border border-border-subtle bg-muted/40 p-1">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              mode === value
                ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
      </div>
      {mode === "sources" ? children : <StandaloneComingSoon />}
    </>
  );
}
