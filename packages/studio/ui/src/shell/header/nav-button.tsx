import { Menu } from "lucide-react";

interface NavButtonProps {
  /** Whether the navigation drawer is open. */
  open: boolean;
  onOpen: () => void;
  ref?: React.Ref<HTMLButtonElement> | undefined;
}

/**
 * The header's way to the navigation drawer, on a screen with no room for
 * the sidebar: a narrow window, or a phone held sideways. Elsewhere it is
 * not shown.
 *
 * @param props - Whether the drawer is open, what opens it, and a ref the drawer gives the focus back to
 * @returns The button
 * @example
 * ```tsx
 * <NavButton ref={menuButton} open={open} onOpen={() => setOpen(true)} />
 * ```
 */
export function NavButton({ open, onOpen, ref }: NavButtonProps): React.ReactNode {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Open navigation"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className="-ml-2 hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand shell-compact:flex"
    >
      <Menu aria-hidden="true" className="size-4" />
    </button>
  );
}
