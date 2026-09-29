import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const TYPE_CONFIG: Record<TypeBadgeProps["type"], { label: string; variant: BadgeVariant }> = {
  query: { label: "query", variant: "sky" },
  mutation: { label: "mutation", variant: "amber" },
  untyped: { label: "untyped", variant: "secondary" },
};

interface TypeBadgeProps {
  type: "query" | "mutation" | "untyped";
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps): React.ReactElement {
  const config = TYPE_CONFIG[type];

  return (
    <Badge
      variant={config.variant}
      className={cn("text-[10px] font-medium", className)}
    >
      {config.label}
    </Badge>
  );
}
