import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const SYMBOL_MAP: Record<string, string> = {
  mod: IS_MAC ? "\u2318" : "Ctrl",
  shift: IS_MAC ? "\u21E7" : "Shift",
  alt: IS_MAC ? "\u2325" : "Alt",
  ctrl: IS_MAC ? "\u2303" : "Ctrl",
  enter: "\u21B5",
  backspace: "\u232B",
  delete: "\u2326",
  escape: "Esc",
  tab: "\u21E5",
  up: "\u2191",
  down: "\u2193",
  left: "\u2190",
  right: "\u2192",
};

interface KbdHintProps {
  keys: string;
  className?: string;
}

export function KbdHint({
  keys,
  className,
}: KbdHintProps): React.ReactElement {
  const parts = keys.split("+").map((k) => {
    const lower = k.trim().toLowerCase();
    return SYMBOL_MAP[lower] ?? k.trim().toUpperCase();
  });

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((part, i) => (
        <Kbd key={i}>{part}</Kbd>
      ))}
    </span>
  );
}
