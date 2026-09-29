import { DraftCard } from "./draft-card";
import type { DraftErrors, MockDraft, MockWizardState } from "./types";

interface ConfigureStepProps {
  state: MockWizardState;
  errors: ReadonlyMap<number, DraftErrors>;
  onEdit: (index: number, patch: Partial<Omit<MockDraft, "source">>) => void;
  onRemove: (index: number) => void;
}

/**
 * The Configure step: one card per picked source, the problems Studio
 * reported that concern no draft as sent, and what every mock serves.
 *
 * @param props - The wizard, the problems per draft, and the edit handlers
 * @returns The step
 *
 * @example
 * ```tsx
 * <ConfigureStep state={state} errors={errors} onEdit={edit} onRemove={remove} />
 * ```
 */
export function ConfigureStep({
  state,
  errors,
  onEdit,
  onRemove,
}: ConfigureStepProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3">Configure the mocks</h3>
        <p className="text-body-sm text-muted-foreground">
          Each mock is declared in courier.mocks.ts under its key, and serves every endpoint of its
          source.
        </p>
      </div>

      {state.requestProblems.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2"
        >
          {state.requestProblems.map((problem, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: messages in the order they were raised; the same text may repeat
            <p key={`${index}:${problem}`} className="text-body-xs text-rose-400">
              {problem}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {state.drafts.map((draft, index) => (
          <DraftCard
            key={draft.source}
            index={index}
            draft={draft}
            errors={errors.get(index)}
            onEdit={(patch) => onEdit(index, patch)}
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-border-subtle bg-muted/20 px-4 py-3">
        <p className="text-body-xs text-muted-foreground">
          Built-in scenarios available via Admin API (
          <span className="font-mono">/__admin/scenarios/:name</span>):
        </p>
        <ul className="mt-1.5 space-y-0.5 text-body-xs text-muted-foreground">
          <li>
            <span className="font-mono text-foreground">happy-path</span> — full CRUD with
            auto-generated data
          </li>
          <li>
            <span className="font-mono text-foreground">empty</span> — all list endpoints return []
          </li>
          <li>
            <span className="font-mono text-foreground">server-error</span> — every endpoint fails
            with 500, 503 or 502
          </li>
          <li>
            <span className="font-mono text-foreground">slow-network</span> — 3G latency on read
            endpoints
          </li>
        </ul>
      </div>
    </div>
  );
}
