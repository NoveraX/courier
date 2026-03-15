import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 select-none",
        "font-sans text-[11px] font-medium leading-none tracking-wide",
        "bg-foreground/[0.06] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
