import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { writeClipboardText } from "@/lib/write-clipboard-text";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  size?: "icon-xs" | "icon-sm" | "icon";
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "icon-xs",
}: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await writeClipboardText(value);
    } catch (err) {
      console.warn("Copying failed", err);
      toast.error(err instanceof Error ? err.message : "Could not copy");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          onClick={handleCopy}
          aria-label={copied ? "Copied" : label}
        >
          {copied ? (
            <Check className="text-success-foreground" />
          ) : (
            <Copy />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {copied ? "Copied!" : label}
      </TooltipContent>
    </Tooltip>
  );
}
