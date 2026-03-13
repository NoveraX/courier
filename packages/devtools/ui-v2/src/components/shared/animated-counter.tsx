import { useEffect, useRef } from "react";
import { useSpring, useMotionValueEvent } from "motion/react";

import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  className?: string;
  format?: (n: number) => string;
}

export function AnimatedCounter({
  value,
  className,
  format = defaultFormat,
}: AnimatedCounterProps): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const spring = useSpring(0, { stiffness: 120, damping: 20, mass: 1 });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useMotionValueEvent(spring, "change", (latest) => {
    if (ref.current) {
      ref.current.textContent = format(Math.round(latest));
    }
  });

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(value)}
    </span>
  );
}

function defaultFormat(n: number): string {
  return n.toLocaleString("en-US");
}
