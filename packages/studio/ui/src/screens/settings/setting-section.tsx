import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingSectionProps {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** A text colour class for the icon's tile. */
  tone: string;
  /** Drawn with a red edge: the destructive actions. */
  danger?: boolean | undefined;
  children: React.ReactNode;
}

/**
 * One section of Settings: an icon tile, its name and what it covers, and
 * its rows.
 *
 * @param props - Its anchor, name, description, icon, tone, whether it is destructive, and its rows
 * @returns The section
 * @example
 * ```tsx
 * <SettingSection id="display" label="Display" description="…" icon={Eye} tone="text-syntax-type">{rows}</SettingSection>
 * ```
 */
export function SettingSection(props: SettingSectionProps): React.ReactNode {
  const { id, label, description, icon: Icon, tone, danger, children } = props;
  return (
    <section
      id={`settings-${id}`}
      aria-label={label}
      className={cn(
        "flex scroll-mt-5 flex-col overflow-hidden rounded-sheet border bg-panel",
        danger ? "border-err/30" : "border-line",
      )}
    >
      <div className="flex items-center gap-3 border-b border-line px-4.5 py-4">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,currentColor_13%,transparent)]",
            tone,
          )}
        >
          <Icon aria-hidden="true" className="size-3.75" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-title font-semibold">{label}</h2>
          <span className="text-small text-fg-subtle">{description}</span>
        </div>
      </div>
      {children}
    </section>
  );
}
