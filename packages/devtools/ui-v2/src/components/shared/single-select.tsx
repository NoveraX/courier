import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import type { LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SingleSelectOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

interface SingleSelectProps {
  options: SingleSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SingleSelect({
  options,
  value,
  onChange,
  className,
}: SingleSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.value === value) ?? options[0] ?? { value: "", label: "—" };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 gap-1.5 border-dashed border-border-subtle text-xs ${className ?? ""}`}
        >
          {active.icon && <active.icon className="size-3 text-muted-foreground" />}
          {active.label}
          <ChevronsUpDown className="ml-0.5 size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value || opt.label}
                  value={opt.value || opt.label}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  {opt.icon && <opt.icon className="size-3.5 text-muted-foreground" />}
                  <span className="flex-1">{opt.label}</span>
                  {value === opt.value && (
                    <Check className="size-3.5 text-accent-brand" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
