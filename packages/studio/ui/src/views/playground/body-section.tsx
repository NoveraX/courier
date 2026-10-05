import { FileJson } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { FormBodyField } from "@/features/playground/form-body";
import { FormBodyEditor } from "./form-body-editor";
import { JsonEditor } from "./json-editor";

export type BodyKind = "json" | "form";

interface BodySectionProps {
  kind: BodyKind;
  /** Whether a form can be sent: an HTTP call, not a stream or a channel */
  formAllowed: boolean;
  variables: string;
  formFields: FormBodyField[];
  schemaHint?: string | undefined;
  onKindChange: (kind: BodyKind) => void;
  onVariablesChange: (value: string) => void;
  onFormFieldsChange: (fields: FormBodyField[]) => void;
}

/**
 * What a call sends: its variables as JSON, or a form with text fields and
 * files — the body an upload endpoint takes.
 *
 * @param props - The body, its kind, and what to call when either changes
 * @returns The section
 *
 * @example
 * ```tsx
 * <BodySection kind={pg.bodyKind} formAllowed={!isRealtime} ... />
 * ```
 */
export function BodySection(props: BodySectionProps): React.ReactElement {
  const kind = props.formAllowed ? props.kind : "json";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <FileJson className="size-3 text-muted-foreground" />
        <span className="text-caption text-muted-foreground">
          {kind === "form" ? "Form" : "Variables"}
        </span>
        {props.schemaHint && (
          <span className="text-[10px] text-emerald-400/70">{props.schemaHint}</span>
        )}
        {props.formAllowed && (
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={(next) => {
              if (next === "json" || next === "form") props.onKindChange(next);
            }}
            variant="outline"
            size="sm"
            className="ml-auto h-6"
            aria-label="Body"
          >
            <ToggleGroupItem value="json" className="h-6 px-2 text-xs">
              JSON
            </ToggleGroupItem>
            <ToggleGroupItem value="form" className="h-6 px-2 text-xs">
              Form
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      {kind === "form" ? (
        <FormBodyEditor fields={props.formFields} onChange={props.onFormFieldsChange} />
      ) : (
        <JsonEditor
          value={props.variables}
          onChange={props.onVariablesChange}
          placeholder='{ "id": 1 }'
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
