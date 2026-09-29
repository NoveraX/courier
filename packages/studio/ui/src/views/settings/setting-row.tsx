import { Label } from "@/components/ui/label";

// ── Reusable setting row layout ──────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: SettingRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="text-body-sm text-foreground">
          {label}
        </Label>
        {description && <p className="text-body-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
