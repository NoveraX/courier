import type { ScannedSource } from "@/features/apis/types";
import type { DraftErrors, MockDraft, MockWizardState } from "@/features/mocks/wizard/types";
import { DraftPanel } from "./draft-panel";

interface ConfigureStepProps {
  state: MockWizardState;
  /** The project's sources, whose endpoints and servers each mock is configured against. */
  sources: readonly ScannedSource[];
  errors: ReadonlyMap<number, DraftErrors>;
  onEdit: (index: number, patch: Partial<Omit<MockDraft, "source">>) => void;
  onRemove: (index: number) => void;
}

/**
 * The Configure step: each mock to declare, with its settings and their
 * problems, and the problems Studio found that name no mock.
 *
 * @param props - The wizard, each draft's problems, and what editing and removing do
 * @returns The step
 * @example
 * ```tsx
 * <ConfigureStep state={state} errors={errors} onEdit={edit} onRemove={remove} />
 * ```
 */
export function ConfigureStep({
  state,
  sources,
  errors,
  onEdit,
  onRemove,
}: ConfigureStepProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h3 className="text-title font-semibold">Configure the mocks</h3>
        <p className="text-small text-fg-subtle">
          Each is declared in courier.mocks.ts under its key.
        </p>
      </div>
      {state.requestProblems.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-panel bg-err-dim px-3 py-2.5">
          {state.requestProblems.map((problem, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: messages in the order they were raised; the same text may repeat
            <p key={`${index}:${problem}`} className="text-small text-err">
              {problem}
            </p>
          ))}
        </div>
      )}
      {state.drafts.map((draft, index) => (
        <DraftPanel
          key={draft.source}
          index={index}
          draft={draft}
          source={sources.find((source) => source.name === draft.source)}
          errors={errors.get(index)}
          onEdit={(patch) => onEdit(index, patch)}
          onRemove={() => onRemove(index)}
        />
      ))}
      <p className="text-small text-fg-subtle">
        Every mock also comes with the built-in scenarios{" "}
        <span className="font-mono text-fg-muted">happy-path</span>,{" "}
        <span className="font-mono text-fg-muted">empty</span>,{" "}
        <span className="font-mono text-fg-muted">server-error</span> and{" "}
        <span className="font-mono text-fg-muted">slow-network</span> — turn them on in the
        Scenarios tab.
      </p>
    </div>
  );
}
