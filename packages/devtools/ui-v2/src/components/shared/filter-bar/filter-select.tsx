import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterSelectProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
}

export function FilterSelect({
  label,
  options,
  selected,
  onChange,
  searchable = true,
}: FilterSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 border-dashed text-xs",
            selected.length > 0 && "border-accent-brand/40",
          )}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
              {selected.length}
            </Badge>
          )}
          <ChevronsUpDown className="ml-0.5 size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`Filter ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => toggle(option.value)}
                >
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border",
                      selected.includes(option.value)
                        ? "border-accent-brand bg-accent-brand text-white"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {selected.includes(option.value) && (
                      <Check className="size-3" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.count !== undefined && (
                    <span className="text-mono-xs text-muted-foreground">
                      {option.count}
                    </span>
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
