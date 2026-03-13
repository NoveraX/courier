import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({
  text,
  size = 12,
  className = "",
}: {
  text: string
  size?: number
  className?: string
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 text-muted-foreground hover:text-secondary-foreground transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
