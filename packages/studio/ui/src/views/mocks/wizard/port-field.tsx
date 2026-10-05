import { SegmentedControl } from "@/components/shared/segmented-control";
import { Input } from "@/components/ui/input";
import { fieldDescriptionIds } from "@/features/mocks/wizard/field-description-ids";
import type { MockDraft, PortMode } from "@/features/mocks/wizard/types";

const PORT_MODES: { value: PortMode; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "fixed", label: "Fixed" },
];

interface PortFieldProps {
  id: string;
  draft: MockDraft;
  hint: string;
  error?: string | undefined;
  onChange: (patch: Pick<MockDraft, "portMode"> | Pick<MockDraft, "portText">) => void;
}

/**
 * A draft's port: one Studio assigns, or one typed and held exactly. The
 * text typed is kept as typed, so a cleared field stays cleared and is
 * reported rather than replaced.
 *
 * @param props - The field's id, the draft, its hint and error, and the change handler
 * @returns The port controls
 *
 * @example
 * ```tsx
 * <PortField id="draft-0-port" draft={draft} hint={hint} error={errors.port} onChange={onEdit} />
 * ```
 */
export function PortField({
  id,
  draft,
  hint,
  error,
  onChange,
}: PortFieldProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <SegmentedControl
        options={PORT_MODES}
        value={draft.portMode}
        onChange={(portMode) => onChange({ portMode })}
      />
      {draft.portMode === "fixed" && (
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="7001"
          value={draft.portText}
          aria-invalid={Boolean(error)}
          aria-describedby={fieldDescriptionIds(id, hint, error)}
          onChange={(event) => onChange({ portText: event.target.value })}
          className="h-7 w-24 mono-sm"
        />
      )}
    </div>
  );
}
