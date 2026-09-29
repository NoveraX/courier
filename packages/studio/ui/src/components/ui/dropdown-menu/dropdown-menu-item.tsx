import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-hidden select-none transition-colors focus:bg-white/5 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground",
        variant === "destructive" &&
          "text-rose-500/80 focus:bg-rose-500/10 focus:text-rose-500 dark:text-rose-400/80 dark:focus:bg-rose-500/15 dark:focus:text-rose-400 [&_svg]:text-rose-500/70! dark:[&_svg]:text-rose-400/70!",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenuItem };
