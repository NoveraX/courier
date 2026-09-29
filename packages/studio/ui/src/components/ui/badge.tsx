import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        success: "bg-success/15 text-success-foreground border-success/20",
        warning: "bg-warning/15 text-warning-foreground border-warning/20",
        info: "bg-info/15 text-info-foreground border-info/20",
        emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
        amber: "bg-amber-500/15 text-amber-400 border-amber-500/20",
        sky: "bg-sky-500/15 text-sky-400 border-sky-500/20",
        violet: "bg-violet-500/15 text-violet-400 border-violet-500/20",
        orange: "bg-orange-500/15 text-orange-400 border-orange-500/20",
        rose: "bg-rose-500/15 text-rose-400 border-rose-500/20",
        cyan: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
        indigo: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
        lime: "bg-lime-500/15 text-lime-400 border-lime-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
