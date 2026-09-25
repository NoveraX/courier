import { Loader2 } from "lucide-react";

import type { ScannedSource } from "@/views/apis/types";
import type { SourceAvailability } from "./source-availability";
import type { MockWizardState, WizardMode } from "./types";

import { ModeSwitch } from "./mode-switch";
import { SourceList } from "./source-list";

function Unavailable({ availability }: { availability: SourceAvailability }): React.ReactElement | null {
  const note = (text: string): React.ReactElement => (
    <p className="py-8 text-center text-body-sm text-muted-foreground">{text}</p>
  );
  switch (availability.kind) {
    case "connecting":
    case "loading":
      return (
        <p className="flex items-center justify-center gap-1.5 py-8 text-body-sm text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {availability.kind === "connecting" ? "Connecting to Studio…" : "Studio is loading courier.config…"}
        </p>
      );
    case "failed":
      return (
        <div role="alert" className="space-y-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
          <p className="text-body-sm text-rose-400">
            {availability.configFile} does not load, so there are no sources to mock. Fix it and they appear here.
          </p>
          <p className="whitespace-pre-wrap mono-xs text-rose-400/80">{availability.message}</p>
        </div>
      );
    case "missing":
      return note(
        availability.deleted
          ? "courier.config was deleted. Restore it to mock its sources."
          : "There is no courier.config.ts yet. Declare your API sources there first.",
      );
    case "empty":
      return note(`${availability.configFile} declares no API sources yet.`);
    case "sources":
      return null;
  }
}

interface SourceStepProps {
  state: MockWizardState;
  availability: SourceAvailability;
  sources: readonly ScannedSource[];
  onModeChange: (mode: WizardMode) => void;
  onToggle: (source: string) => void;
}

/**
 * The Sources step: the sources `courier.config` declares to pick for new
 * mocks, or why there are none to pick — Studio is connecting or loading,
 * the config does not load, or there is none — and the standalone mode.
 *
 * @param props - The wizard, the sources and their availability, and the handlers
 * @returns The step
 *
 * @example
 * ```tsx
 * <SourceStep state={state} availability={availability} sources={scanSources} onModeChange={setMode} onToggle={toggle} />
 * ```
 */
export function SourceStep({ state, availability, sources, onModeChange, onToggle }: SourceStepProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3">Select API sources</h3>
        <p className="text-body-sm text-muted-foreground">
          Pick the sources to mock. Studio declares one mock for each in courier.mocks.ts.
        </p>
      </div>
      <ModeSwitch mode={state.mode} onModeChange={onModeChange}>
        {availability.kind === "sources" ? (
          <SourceList sources={sources} drafts={state.drafts} onToggle={onToggle} />
        ) : (
          <Unavailable availability={availability} />
        )}
      </ModeSwitch>
    </div>
  );
}
