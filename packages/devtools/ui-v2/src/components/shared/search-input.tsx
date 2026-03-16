import { forwardRef, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional right-side text (e.g. "5/24" match count) */
  badge?: string;
  /** Debounce delay in ms (0 = no debounce) */
  debounce?: number;
  className?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ value, onChange, placeholder = "Search...", badge, debounce = 0, className }, ref) {
    const [local, setLocal] = useState(value);
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync external value → local
    useEffect(() => { setLocal(value); }, [value]);

    const handleChange = (next: string): void => {
      setLocal(next);
      if (debounce <= 0) {
        onChange(next);
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(next), debounce);
    };

    // Cleanup timer on unmount
    useEffect(() => () => clearTimeout(timerRef.current), []);

    return (
      <div className={cn("relative w-56", className)}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={local}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={cn("h-7 pl-8 text-body-sm", badge && "pr-12")}
        />
        {badge && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-body-xs tabular-nums text-muted-foreground/60">
            {badge}
          </span>
        )}
      </div>
    );
  },
);
