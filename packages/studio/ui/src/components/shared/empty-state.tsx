import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  /** Shown between the description and the action: a snippet, say. */
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
  className,
  children,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-12 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border-subtle">
        <Icon className="size-6 text-muted-foreground" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">{heading}</h3>
        <p className="text-body-sm text-muted-foreground max-w-[360px]">
          {description}
        </p>
      </div>

      {children}

      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
