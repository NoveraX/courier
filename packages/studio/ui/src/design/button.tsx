import { cn } from "@/lib/utils";

const VARIANTS = {
  outline: "border-line text-fg-muted hover:border-line-strong hover:text-fg",
  danger: "border-err/40 font-strong text-err hover:bg-err-dim",
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `outline` for a neutral action; `danger` for one that answers a failure. */
  variant?: keyof typeof VARIANTS | undefined;
}

/**
 * A toolbar-height button with a hairline border.
 *
 * @param props - The button's attributes and its variant
 * @returns The button, `type="button"` unless told otherwise
 * @example
 * ```tsx
 * <Button onClick={reconnect} variant="danger">Reconnect now</Button>
 * ```
 */
export function Button({
  variant = "outline",
  type = "button",
  className,
  ...props
}: ButtonProps): React.ReactNode {
  return (
    <button
      type={type}
      className={cn(
        "flex h-7.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-control border bg-transparent px-2.5 text-control transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        "disabled:cursor-default disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
