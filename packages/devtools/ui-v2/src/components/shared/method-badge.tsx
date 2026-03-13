import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const METHOD_VARIANT: Record<string, BadgeVariant> = {
  GET: "emerald",
  POST: "sky",
  PUT: "amber",
  PATCH: "violet",
  DELETE: "rose",
  HEAD: "cyan",
  OPTIONS: "orange",
};

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({
  method,
  className,
}: MethodBadgeProps): React.ReactElement {
  const upper = method.toUpperCase();
  const variant = METHOD_VARIANT[upper] ?? "secondary";

  return (
    <Badge
      variant={variant}
      className={cn("font-mono text-[10px] tracking-wider", className)}
    >
      {upper}
    </Badge>
  );
}
