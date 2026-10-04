import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";
import { STATUS_CONFIG } from "@/components/shared/detail-panel/constants";
import { formatDuration, formatRelativeTime } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/hooks/use-tick";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types-request";

interface RequestPickerProps {
  requests: RequestEntry[];
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  label: string;
  excludeId?: string | undefined;
}

function buildLabel(r: RequestEntry): string {
  const parts = [r.source];
  if (r.group) parts.push(r.group);
  parts.push(r.method);
  return parts.join(".");
}

export function RequestPicker({
  requests,
  selectedId,
  onSelect,
  label,
  excludeId,
}: RequestPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const selected = requests.find((r) => r.id === selectedId);
  const filtered = excludeId ? requests.filter((r) => r.id !== excludeId) : requests;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between gap-2 border-border-subtle bg-background px-2.5 text-xs font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <PickerLabel request={selected} />
          ) : (
            <span className="flex items-center gap-1.5">
              <Search className="size-3 text-muted-foreground/60" />
              {label}
            </span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search requests..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              No requests found.
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${buildLabel(r)}-${r.id}`}
                  onSelect={() => {
                    onSelect(r.id === selectedId ? undefined : r.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs"
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", STATUS_CONFIG[r.status].dot)}
                  />
                  <MethodBadge method={r.httpMethod ?? "GET"} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {buildLabel(r)}
                  </span>
                  {r.timing?.total != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDuration(r.timing.total)}
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(r.startedAt, now)}
                  </span>
                  {r.id === selectedId && <Check className="size-3 shrink-0 text-accent-brand" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PickerLabel({ request }: { request: RequestEntry }): React.ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_CONFIG[request.status].dot)} />
      <MethodBadge method={request.httpMethod ?? "GET"} className="shrink-0" />
      <span className="min-w-0 truncate font-mono text-[11px]">{buildLabel(request)}</span>
    </span>
  );
}
