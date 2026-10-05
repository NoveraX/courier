import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { cn } from "@/lib/utils";

/** One of the choices a choice menu offers. */
export interface Choice<TValue extends string> {
  value: TValue;
  label: string;
}

interface ChoiceMenuProps<TValue extends string> {
  icon: LucideIcon;
  /** What is being chosen, shown before the choice: "Sort", "Group". */
  label: string;
  choices: readonly Choice<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
}

/**
 * A toolbar button that names a setting and its current choice, opening a
 * menu of the others with the current one checked.
 *
 * @param props - What is chosen, the choices, the current one and what changes it
 * @returns The button and its menu
 * @example
 * ```tsx
 * <ChoiceMenu icon={Layers} label="Group" choices={GROUPS} value={group} onChange={setGroup} />
 * ```
 */
export function ChoiceMenu<TValue extends string>(props: ChoiceMenuProps<TValue>): React.ReactNode {
  const { icon: Icon, label, choices, value, onChange } = props;
  const current = choices.find((c) => c.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-control border border-line bg-panel px-2.5 text-control whitespace-nowrap text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong">
        <Icon aria-hidden="true" className="size-3.25 text-fg-subtle" />
        <span className="text-fg-subtle">{label}</span>
        <span className="font-strong text-fg">{current}</span>
        <ChevronDown aria-hidden="true" className="size-3 text-fg-subtle" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-45 animate-pop-in rounded-panel bg-panel p-1 shadow-overlay"
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => onChange(choiceOf(choices, next) ?? value)}
          >
            {choices.map((choice) => (
              <DropdownMenu.RadioItem
                key={choice.value}
                value={choice.value}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-control outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg",
                  choice.value === value ? "text-fg" : "text-fg-muted",
                )}
              >
                <span className="flex-1">{choice.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden="true" className="size-3.25 text-brand" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function choiceOf<TValue extends string>(
  choices: readonly Choice<TValue>[],
  value: string,
): TValue | undefined {
  return choices.find((c) => c.value === value)?.value;
}
