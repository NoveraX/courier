import type { LucideIcon } from "lucide-react";
import { Check, Ellipsis } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { cn } from "@/lib/utils";
import { focusOnClose } from "./focus-on-close";
import { POP_MOTION } from "./overlay-motion";

/** One thing a "⋯" menu does. */
export interface OverflowAction {
  /** Unique among the menu's actions. */
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean | undefined;
  /** Shown with a check while it is on: a setting the action turns on and off. */
  checked?: boolean | undefined;
  /** `danger` for an action that discards something. */
  tone?: "danger" | undefined;
}

interface OverflowMenuProps {
  /** What the button says to a screen reader: "More actions". */
  label: string;
  actions: readonly OverflowAction[];
  className?: string | undefined;
}

/**
 * A "⋯" button and the menu it opens: the actions a narrow toolbar has no
 * room to show as buttons of their own. The items are rendered only while
 * the menu is open, so a toolbar that shows the same actions as buttons on a
 * wide screen never has them twice.
 *
 * @param props - The button's label, the actions, and classes for the button
 * @returns The button, with the menu it opens
 * @example
 * ```tsx
 * <OverflowMenu
 *   label="More actions"
 *   actions={[{ key: "clear", label: "Clear", icon: Trash2, onSelect: clear, tone: "danger" }]}
 *   className="sm:hidden"
 * />
 * ```
 */
export function OverflowMenu({ label, actions, className }: OverflowMenuProps): React.ReactNode {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className={cn(
          "flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line bg-panel text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong data-[state=open]:text-fg pointer-coarse:size-9",
          className,
        )}
      >
        <Ellipsis aria-hidden="true" className="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          onCloseAutoFocus={focusOnClose}
          className={cn(
            "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-50 max-w-[calc(100vw-16px)] overflow-y-auto rounded-panel bg-panel p-1 shadow-overlay",
            POP_MOTION,
          )}
        >
          {actions.map((action) => (
            <ActionItem key={action.key} action={action} />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ActionItem({ action }: { action: OverflowAction }): React.ReactNode {
  const { icon: Icon, label, onSelect, disabled, checked, tone } = action;
  return (
    <DropdownMenu.Item
      disabled={disabled === true}
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-control outline-none data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-raised pointer-coarse:h-10",
        tone === "danger"
          ? "text-err data-highlighted:text-err"
          : "text-fg-muted data-highlighted:text-fg",
      )}
    >
      <Icon aria-hidden="true" className="size-3.25 w-3.5" />
      <span className="flex-1">{label}</span>
      {checked === true && <Check aria-hidden="true" className="size-3.25 text-brand" />}
    </DropdownMenu.Item>
  );
}
