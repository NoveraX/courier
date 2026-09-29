import { Slider } from "@/components/ui/slider";

interface SliderRowProps {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  unit: string;
}

export function SliderRow({
  label,
  sub,
  value,
  onChange,
  min = 0,
  max,
  step = 10,
  unit,
}: SliderRowProps): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-body-xs text-muted-foreground/70">
          {label}
          {sub && <span className="text-muted-foreground/40"> {sub}</span>}
        </span>
        <span className="inline-flex items-baseline gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 text-mono-xs tabular-nums">
          <span className="text-foreground">{value}</span>
          <span className="text-muted-foreground/50">{unit}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
