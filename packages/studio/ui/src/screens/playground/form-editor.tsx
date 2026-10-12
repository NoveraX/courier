import { Plus, X } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { FormBodyField } from "@/features/playground/form-body";
import { emptyField } from "@/features/playground/form-body";

const KINDS: readonly SegmentedOption<FormBodyField["kind"]>[] = [
  { value: "text", label: "Text" },
  { value: "file", label: "File" },
];

const FIELD =
  "h-7.5 min-w-0 rounded-control border border-line bg-panel px-2.5 font-mono text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand/60 pointer-coarse:h-9 pointer-coarse:text-[16px]";

interface FormEditorProps {
  fields: readonly FormBodyField[];
  onChange: (fields: FormBodyField[]) => void;
}

/**
 * The body as a form: a row per field — its name, text or a file, and a
 * way to drop it — sent as multipart form data in place of the variables.
 * In a phone's pane a field's value takes a line of its own under its name.
 *
 * @param props - The fields, and what changes them
 * @returns The editor
 * @example
 * ```tsx
 * <FormEditor fields={fields} onChange={setFields} />
 * ```
 */
export function FormEditor({ fields, onChange }: FormEditorProps): React.ReactNode {
  const update = (id: string, patch: Partial<FormBodyField>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  return (
    <div className="flex min-h-55 flex-[1_0_auto] flex-col gap-2 bg-inset px-4 py-3.5">
      {fields.map((field) => (
        <div
          key={field.id}
          className="flex items-center gap-2 max-sm:flex-wrap short-screen:flex-wrap"
        >
          <input
            aria-label="Field name"
            placeholder="name"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={field.name}
            onChange={(e) => update(field.id, { name: e.target.value })}
            className={`${FIELD} w-32 shrink-0`}
          />
          <Segmented
            label={`What ${field.name || "the field"} holds`}
            options={KINDS}
            value={field.kind}
            onChange={(kind) => update(field.id, { kind })}
            quiet="subtle"
          />
          {field.kind === "text" ? (
            <input
              aria-label={`Value of ${field.name || "field"}`}
              autoCapitalize="off"
              autoCorrect="off"
              value={field.text}
              onChange={(e) => update(field.id, { text: e.target.value })}
              className={`${FIELD} flex-1 max-sm:order-1 short-screen:order-1 max-sm:basis-full short-screen:basis-full`}
            />
          ) : (
            <input
              type="file"
              aria-label={`File for ${field.name || "field"}`}
              onChange={(e) => update(field.id, { file: e.target.files?.[0] ?? null })}
              className="min-w-0 flex-1 text-small text-fg-muted file:mr-2.5 file:h-7.5 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-panel file:px-2.5 file:text-small file:text-fg max-sm:order-1 short-screen:order-1 max-sm:basis-full short-screen:basis-full pointer-coarse:file:h-9"
            />
          )}
          <button
            type="button"
            aria-label="Remove field"
            onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg max-sm:ml-auto short-screen:ml-auto pointer-coarse:size-9"
          >
            <X aria-hidden="true" className="size-3.25" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyField()])}
        className="flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-control px-2 text-small text-fg-muted hover:bg-raised hover:text-fg pointer-coarse:h-9 pointer-coarse:px-2.5"
      >
        <Plus aria-hidden="true" className="size-3" />
        Add field
      </button>
    </div>
  );
}
