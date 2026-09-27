import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** A labelled row of the options step. */
export function FieldRow({ label, children }: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      {children}
    </div>
  );
}

/** One choice of an option: the value it sets, and what it is called. */
export interface OptionChoice<TValue extends string> {
  value: TValue;
  label: string;
}

/**
 * An option picked from a fixed list: only a value the list holds is ever
 * set, whatever the select reports.
 *
 * @param props.label - The option's name
 * @param props.value - Its value now
 * @param props.choices - The values it can take
 * @param props.onChange - Told the value picked
 * @returns The row
 */
export function ChoiceRow<TValue extends string>({ label, value, choices, onChange }: {
  label: string;
  value: TValue;
  choices: ReadonlyArray<OptionChoice<TValue>>;
  onChange: (value: TValue) => void;
}): React.ReactElement {
  const pick = (raw: string): void => {
    const chosen = choices.find((choice) => choice.value === raw);
    if (chosen) onChange(chosen.value);
  };
  return (
    <FieldRow label={label}>
      <Select value={value} onValueChange={pick}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

/** An option that is on or off. */
export function SwitchRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
      <Label className="text-body-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}
