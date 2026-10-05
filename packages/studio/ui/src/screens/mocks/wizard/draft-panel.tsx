import { FIELD_INPUT, FormField } from "@/design/form-field";
import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import type { ScannedSource } from "@/features/apis/types";
import { answerableEndpoints } from "@/features/mocks/wizard/answerable-endpoints";
import { fieldDescriptionIds } from "@/features/mocks/wizard/field-description-ids";
import type { DraftErrors, MockDraft, PortMode } from "@/features/mocks/wizard/types";
import { DraftAnswersField } from "./draft-answers-field";
import { DraftDataField } from "./draft-data-field";

const PORT_MODES: readonly { value: PortMode; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "fixed", label: "Fixed" },
];

const PORT_HINTS = {
  auto: "Studio assigns one from studio.mockBasePort; it can change after Studio restarts.",
  fixed: "Studio holds exactly this port, and says so when another process has it.",
} as const;

interface DraftPanelProps {
  index: number;
  draft: MockDraft;
  /** The source it mocks, as Studio scanned it: its endpoints and its server. */
  source: ScannedSource | undefined;
  errors: DraftErrors | undefined;
  onEdit: (patch: Partial<Omit<MockDraft, "source">>) => void;
  onRemove: () => void;
}

/**
 * One mock the wizard will declare: the source it mocks, its key, its
 * port, how many records each collection is seeded with, and whether it
 * starts with Studio.
 *
 * @param props - Its position, the draft, its problems, and what editing and removing do
 * @returns The panel
 * @example
 * ```tsx
 * <DraftPanel index={0} draft={draft} errors={undefined} onEdit={edit} onRemove={remove} />
 * ```
 */
export function DraftPanel({
  index,
  draft,
  source,
  errors,
  onEdit,
  onRemove,
}: DraftPanelProps): React.ReactNode {
  const id = `mock-draft-${index}`;
  const portHint = PORT_HINTS[draft.portMode];
  return (
    <section
      aria-label={`Mock of ${draft.source}`}
      className="overflow-hidden rounded-[11px] border border-line"
    >
      <header className="flex h-9 items-center gap-2 border-b border-line bg-panel-subtle px-3.5">
        <span className="truncate font-mono text-control font-medium">{draft.source}</span>
        <span className="truncate font-mono text-small text-fg-subtle">
          → mocks.{draft.key || "…"}
        </span>
        {errors?.source && (
          <>
            <span className="ml-auto truncate text-small text-err">{errors.source}</span>
            <button
              type="button"
              onClick={onRemove}
              className="flex h-6.5 cursor-pointer items-center rounded-[6px] px-2 text-small text-fg-muted hover:bg-raised hover:text-fg"
            >
              Remove
            </button>
          </>
        )}
      </header>
      <div className="flex flex-col px-3.5">
        <FormField id={`${id}-key`} label="Mock key" sub="its name under mocks" error={errors?.key}>
          <input
            id={`${id}-key`}
            value={draft.key}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(errors?.key)}
            aria-describedby={fieldDescriptionIds(`${id}-key`, undefined, errors?.key)}
            onChange={(e) => onEdit({ key: e.target.value })}
            className={FIELD_INPUT}
          />
        </FormField>
        <FormField
          id={`${id}-port`}
          label="Port"
          sub="where the mock listens"
          hint={portHint}
          error={errors?.port}
        >
          <div className="flex items-center gap-2">
            <Segmented
              label="Port"
              quiet="subtle"
              options={PORT_MODES}
              value={draft.portMode}
              onChange={(portMode) => onEdit({ portMode })}
            />
            {draft.portMode === "fixed" && (
              <input
                id={`${id}-port`}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="7001"
                value={draft.portText}
                aria-invalid={Boolean(errors?.port)}
                aria-describedby={fieldDescriptionIds(`${id}-port`, portHint, errors?.port)}
                onChange={(e) => onEdit({ portText: e.target.value })}
                className={`${FIELD_INPUT} max-w-24`}
              />
            )}
          </div>
        </FormField>
        <FormField
          id={`${id}-seed`}
          label="Records per collection"
          sub="seeded into each collection"
          error={errors?.seedCount}
        >
          <input
            id={`${id}-seed`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.seedCountText}
            aria-invalid={Boolean(errors?.seedCount)}
            aria-describedby={fieldDescriptionIds(`${id}-seed`, undefined, errors?.seedCount)}
            onChange={(e) => onEdit({ seedCountText: e.target.value })}
            className={`${FIELD_INPUT} max-w-24`}
          />
        </FormField>
        <DraftAnswersField
          id={id}
          draft={draft}
          groups={answerableEndpoints(source)}
          baseURL={source?.baseURL ?? ""}
          error={errors?.endpoints}
          onEdit={onEdit}
        />
        <DraftDataField id={id} draft={draft} baseURL={source?.baseURL ?? ""} onEdit={onEdit} />
        <FormField
          id={`${id}-start`}
          label="Start with Studio"
          sub="also starts it as soon as it is added"
        >
          <ToggleSwitch
            id={`${id}-start`}
            label={`Start mocks.${draft.key || draft.source} with Studio`}
            checked={draft.autoStart}
            onChange={(autoStart) => onEdit({ autoStart })}
          />
        </FormField>
      </div>
    </section>
  );
}
