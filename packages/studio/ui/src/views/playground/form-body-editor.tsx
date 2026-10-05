import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { emptyField, type FormBodyField } from "@/features/playground/form-body";

interface FormBodyEditorProps {
  fields: FormBodyField[];
  onChange: (fields: FormBodyField[]) => void;
}

/**
 * The rows of a form body: each a name with a text value or a file.
 *
 * @param props - The rows, and what to call when one changes
 * @returns The editor
 *
 * @example
 * ```tsx
 * <FormBodyEditor fields={pg.formFields} onChange={pg.setFormFields} />
 * ```
 */
export function FormBodyEditor({ fields, onChange }: FormBodyEditorProps): React.ReactElement {
  const update = (id: string, patch: Partial<FormBodyField>): void =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
      {fields.map((field) => (
        <div key={field.id} className="flex items-center gap-1.5">
          <Input
            aria-label="Field name"
            placeholder="name"
            value={field.name}
            onChange={(e) => update(field.id, { name: e.target.value })}
            className="h-7 w-32 shrink-0 font-mono text-xs"
          />
          <ToggleGroup
            type="single"
            value={field.kind}
            onValueChange={(kind) => {
              if (kind === "text" || kind === "file") update(field.id, { kind });
            }}
            variant="outline"
            size="sm"
            className="h-7 shrink-0"
          >
            <ToggleGroupItem value="text" className="h-7 px-2 text-xs">
              Text
            </ToggleGroupItem>
            <ToggleGroupItem value="file" className="h-7 px-2 text-xs">
              File
            </ToggleGroupItem>
          </ToggleGroup>
          {field.kind === "text" ? (
            <Input
              aria-label={`Value of ${field.name || "field"}`}
              value={field.text}
              onChange={(e) => update(field.id, { text: e.target.value })}
              className="h-7 min-w-0 flex-1 font-mono text-xs"
            />
          ) : (
            <Input
              type="file"
              aria-label={`File for ${field.name || "field"}`}
              onChange={(e) => update(field.id, { file: e.target.files?.[0] ?? null })}
              className="h-7 min-w-0 flex-1 text-xs"
            />
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove field"
            onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
          >
            <X className="size-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1.5 text-xs"
        onClick={() => onChange([...fields, emptyField()])}
      >
        <Plus className="size-3" />
        Add field
      </Button>
    </div>
  );
}
