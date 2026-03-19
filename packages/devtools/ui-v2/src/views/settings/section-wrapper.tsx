import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

// ── Section wrapper ──────────────────────────────────────────────────────────

interface SectionWrapperProps {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Red-tinted header for danger zone */
  destructive?: boolean;
}

export function SectionWrapper({
  id,
  icon: Icon,
  title,
  description,
  children,
  destructive = false,
}: SectionWrapperProps): React.ReactElement {
  const [open, setOpen] = useState(true);

  return (
    <section id={id}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 py-3 text-left">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-accent-brand/10 text-accent-brand",
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "text-h3",
                destructive ? "text-destructive" : "text-foreground",
              )}
            >
              {title}
            </h3>
            <p className="text-body-xs text-muted-foreground">{description}</p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 pb-2 pl-11">{children}</div>
        </CollapsibleContent>
      </Collapsible>
      <Separator className="my-2" />
    </section>
  );
}
