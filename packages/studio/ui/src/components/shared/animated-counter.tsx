import { useEffect, useRef } from "react";
import { useSpring, useMotionValueEvent } from "motion/react";

import { displayedCount } from "@/lib/displayed-count";
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
  /* Critically damped: a count that falls to 0 never passes below it on the way. */
  const spring = useSpring(0, { stiffness: 120, damping: 22, mass: 1 });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useMotionValueEvent(spring, "change", (latest) => {
    if (ref.current) {
      ref.current.textContent = format(displayedCount(latest));
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
