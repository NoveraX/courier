import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fieldDescriptionIds } from "@/features/mocks/wizard/field-description-ids";
import type { DraftErrors, MockDraft } from "@/features/mocks/wizard/types";
import { FieldRow } from "./field-row";
import { PortField } from "./port-field";

const PORT_HINTS = {
  auto: "Studio assigns one from studio.mockBasePort; it can change after Studio restarts. Choose Fixed to keep one.",
  fixed: "Studio holds exactly this port, and says so when another process has it.",
} as const;

interface DraftCardProps {
  index: number;
  draft: MockDraft;
  errors: DraftErrors | undefined;
  onEdit: (patch: Partial<Omit<MockDraft, "source">>) => void;
  onRemove: () => void;
}

/**
 * One mock to add: the source it serves, its key in `courier.mocks.ts`,
 * its port, how many records each collection starts with, and whether
 * Studio starts it at launch. A draft whose source the config does not
 * declare says so and can be removed here, since the source list does not
 * offer that source to unpick.
 *
 * @param props - The draft, its position and problems, and the edit handlers
 * @returns The card
 *
 * @example
 * ```tsx
 * <DraftCard index={0} draft={draft} errors={errors.get(0)} onEdit={edit} onRemove={remove} />
 * ```
 */
export function DraftCard({
  index,
  draft,
  errors,
  onEdit,
  onRemove,
}: DraftCardProps): React.ReactElement {
  const id = `mock-draft-${index}`;
  const portHint = PORT_HINTS[draft.portMode];
  return (
    <section
      aria-label={`Mock of ${draft.source}`}
      className="rounded-lg border border-border-subtle"
    >
      <header className="flex h-8 items-center gap-2 rounded-t-lg bg-muted/30 px-3">
        <span className="truncate text-xs font-medium">{draft.source}</span>
        <span className="truncate mono-xs text-muted-foreground">→ mocks.{draft.key || "…"}</span>
        {errors?.source && (
          <>
            <span className="ml-auto truncate text-body-xs text-rose-400">{errors.source}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onRemove}>
              Remove
            </Button>
          </>
        )}
      </header>
      <div className="space-y-3 p-3">
        <FieldRow id={`${id}-key`} label="Mock key" error={errors?.key}>
          <Input
            id={`${id}-key`}
            value={draft.key}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(errors?.key)}
            aria-describedby={fieldDescriptionIds(`${id}-key`, undefined, errors?.key)}
            onChange={(event) => onEdit({ key: event.target.value })}
            className="h-7 max-w-64 mono-sm"
          />
        </FieldRow>
        <FieldRow id={`${id}-port`} label="Port" hint={portHint} error={errors?.port}>
          <PortField
            id={`${id}-port`}
            draft={draft}
            hint={portHint}
            error={errors?.port}
            onChange={onEdit}
          />
        </FieldRow>
        <FieldRow id={`${id}-seed`} label="Records per collection" error={errors?.seedCount}>
          <Input
            id={`${id}-seed`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft.seedCountText}
            aria-invalid={Boolean(errors?.seedCount)}
            aria-describedby={fieldDescriptionIds(`${id}-seed`, undefined, errors?.seedCount)}
            onChange={(event) => onEdit({ seedCountText: event.target.value })}
            className="h-7 w-20 mono-sm"
          />
        </FieldRow>
        <FieldRow
          id={`${id}-start`}
          label="Start with Studio"
          hint="Also starts it as soon as it is added."
        >
          <Switch
            id={`${id}-start`}
            size="sm"
            checked={draft.autoStart}
            aria-describedby={`${id}-start-hint`}
            onCheckedChange={(autoStart) => onEdit({ autoStart })}
          />
        </FieldRow>
      </div>
    </section>
  );
}
