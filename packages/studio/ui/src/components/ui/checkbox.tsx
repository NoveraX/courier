"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded border border-border transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent-brand/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-accent-brand data-[state=checked]:bg-accent-brand data-[state=checked]:text-white",
        "data-[state=indeterminate]:border-accent-brand data-[state=indeterminate]:bg-accent-brand/50 data-[state=indeterminate]:text-white",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-white"
      >
        <CheckIcon className="size-2.5 text-white in-data-[state=indeterminate]:hidden" />
        <MinusIcon className="size-2.5 text-white hidden in-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
