"use client";

import { Loader2, Play } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RunButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  loading?: boolean;
  label?: string;
};

export function RunButton({ loading, label = "Run", className, ...props }: RunButtonProps) {
  return (
    <Button size="sm" disabled={loading} className={cn("gap-1.5", className)} {...props}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
