import { useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MethodBadge } from "@/components/shared/method-badge";
import { formatDuration } from "@/components/shared/formatters";

import type { RequestEntry } from "@/store/types";

// ── Props ──────────────────────────────────────────────────────────────────

interface RequestPickerProps {
  requests: RequestEntry[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RequestPicker({
  requests,
  selectedId,
  onSelect,
}: RequestPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const selected = requests.find((r) => r.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
            "border-border-subtle/60 bg-card/30 hover:bg-card/60",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-brand/40",
            open && "border-accent-brand/30 bg-card/50 ring-1 ring-accent-brand/20",
          )}
        >
          {selected ? (
            <SelectedRequest request={selected} />
          ) : (
            <span className="text-body-sm text-muted-foreground/60">Select a request…</span>
          )}
          <ChevronsUpDown className={cn(
            "ml-auto size-3.5 shrink-0 text-muted-foreground/40 transition-colors",
            "group-hover:text-muted-foreground/70",
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search requests…" />
          <CommandList>
            <CommandEmpty>No requests with middleware</CommandEmpty>
            <CommandGroup>
              {requests.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.source}.${r.group ?? ""}.${r.method}`}
                  onSelect={() => { onSelect(r.id); setOpen(false); }}
                  className="gap-2 py-2"
                >
                  <DropdownLabel request={r} isSelected={r.id === selectedId} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Trigger content ─────────────────────────────────────────────────────────

function SelectedRequest({ request }: { request: RequestEntry }): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <MethodBadge method={request.httpMethod ?? "GET"} />
      <span className="mono-sm truncate text-foreground/90">
        {request.source}.{request.group ?? ""}.{request.method}
      </span>
      <MwCount count={request.middlewareEntries.length} />
      {request.timing && (
        <span className="mono-xs shrink-0 tabular-nums text-muted-foreground/60">
          {formatDuration(request.timing.total)}
        </span>
      )}
    </div>
  );
}

// ── Dropdown item ───────────────────────────────────────────────────────────

function DropdownLabel({ request, isSelected }: {
  request: RequestEntry;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <MethodBadge method={request.httpMethod ?? "GET"} />
      <span className="mono-sm truncate text-foreground/90">
        {request.source}.{request.group ?? ""}.{request.method}
      </span>
      <MwCount count={request.middlewareEntries.length} />
      {request.timing && (
        <span className="mono-xs shrink-0 tabular-nums text-muted-foreground/60">
          {formatDuration(request.timing.total)}
        </span>
      )}
      {isSelected && (
        <Check className="ml-auto size-3.5 shrink-0 text-accent-brand" />
      )}
    </div>
  );
}

// ── MW count pill ───────────────────────────────────────────────────────────

function MwCount({ count }: { count: number }): React.ReactElement {
  return (
    <span className="shrink-0 rounded-full border border-border-subtle/50 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground/60">
      {count} mw
    </span>
  );
}
