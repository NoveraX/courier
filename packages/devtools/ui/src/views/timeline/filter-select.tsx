import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command"

interface FilterSelectProps<T extends string> {
  label: string
  options: T[]
  selected: T[]
  onChange: (values: T[]) => void
  renderOption?: (option: T) => string
}

export function FilterSelect<T extends string>({
  label, options, selected, onChange, renderOption,
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false)

  function toggle(option: T) {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option],
    )
  }

  const display = renderOption ?? ((o: T) => o.replace("_", " "))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            "gap-1 capitalize",
            selected.length > 0 && "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className={cn(
            "size-3 transition-transform",
            open && "rotate-180",
          )} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-44 p-0" align="start">
        <Command>
          {options.length > 5 && <CommandInput placeholder={`Filter ${label.toLowerCase()}...`} className="h-8 text-xs" />}
          <CommandList>
            <CommandEmpty className="py-3 text-xs">No results.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  onSelect={() => toggle(option)}
                  className="gap-2 text-xs capitalize"
                >
                  <div className={cn(
                    "flex size-3.5 items-center justify-center rounded-sm border",
                    selected.includes(option)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}>
                    {selected.includes(option) && <Check className="size-3" />}
                  </div>
                  {display(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
