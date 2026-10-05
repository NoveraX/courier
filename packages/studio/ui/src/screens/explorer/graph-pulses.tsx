import { Fragment, useEffect, useId, useRef } from "react";

import type { Pulse } from "@/features/explorer/call-pulses";

const COLOR: Readonly<Record<Pulse["tone"], string>> = {
  ok: "var(--color-brand)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
};

const TONES: readonly Pulse["tone"][] = ["ok", "warn", "err"];

interface PulseMarkProps {
  pulse: Pulse;
  ids: { glow: string; tail: string };
  onDone: (id: string) => void;
}

/* The browser runs the motion itself; a pulse only starts it and leaves once it ran. */
function PulseMark({ pulse, ids, onDone }: PulseMarkProps): React.ReactNode {
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);
  const { id, duration } = pulse;
  useEffect(() => {
    motion.current?.beginElement?.();
    fade.current?.beginElement?.();
    const timer = setTimeout(() => onDone(id), duration + 60);
    return () => clearTimeout(timer);
  }, [id, duration, onDone]);
  const color = COLOR[pulse.tone];
  return (
    <g opacity={0} data-pulse={pulse.tone}>
      <rect x={-24} y={-1} width={24} height={2} rx={1} fill={`url(#${ids.tail}-${pulse.tone})`} />
      <circle r={8} fill={`url(#${ids.glow}-${pulse.tone})`} />
      <circle r={2.25} style={{ fill: color }} />
      <animateMotion
        ref={motion}
        begin="indefinite"
        dur={`${duration}ms`}
        fill="freeze"
        rotate="auto"
        path={pulse.path}
        calcMode="spline"
        keyPoints="0;1"
        keyTimes="0;1"
        keySplines="0.42 0 0.28 1"
      />
      <animate
        ref={fade}
        attributeName="opacity"
        begin="indefinite"
        dur={`${duration}ms`}
        values="0;1;1;0"
        keyTimes="0;0.1;0.84;1"
        fill="freeze"
      />
    </g>
  );
}

/**
 * The calls running along the graph's branches: each a bright point with a
 * soft glow and a short tail, from its source to its endpoint, blue, amber
 * or red as the call went. One crosses its group's card at once, out of
 * sight, and runs on from the card's other side.
 *
 * @param props - The pulses, and what one that ran its way calls
 * @returns The pulses, for the graph's curves layer
 * @example
 * ```tsx
 * <svg><GraphPulses pulses={pulses} onDone={done} /></svg>
 * ```
 */
export function GraphPulses({
  pulses,
  onDone,
}: {
  pulses: readonly Pulse[];
  onDone: (id: string) => void;
}): React.ReactNode {
  const base = useId().replace(/:/g, "");
  const ids = { glow: `${base}-glow`, tail: `${base}-tail` };
  return (
    <g>
      <defs>
        {TONES.map((tone) => (
          <Fragment key={tone}>
            <radialGradient id={`${ids.glow}-${tone}`}>
              <stop offset="0" style={{ stopColor: COLOR[tone], stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: COLOR[tone], stopOpacity: 0 }} />
            </radialGradient>
            <linearGradient id={`${ids.tail}-${tone}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: COLOR[tone], stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: COLOR[tone], stopOpacity: 0.75 }} />
            </linearGradient>
          </Fragment>
        ))}
      </defs>
      {pulses.map((pulse) => (
        <PulseMark key={pulse.id} pulse={pulse} ids={ids} onDone={onDone} />
      ))}
    </g>
  );
}
