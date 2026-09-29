import type React from "react";

/** What an element needs to act as a button: a role, a place in the tab order, and a key handler. */
export interface ButtonProps {
  role: "button";
  tabIndex: 0;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Let an element that is not a `<button>` — a row, a header, a drop zone —
 * be used as one: it takes focus, is announced as a button, and runs on
 * Enter or Space as well as on the pointer. A key pressed in a field inside
 * it stays that field's.
 *
 * @param onActivate - What the element does
 * @param options - `doubleClick` when the pointer activates it with a double click
 * @returns The props to spread on the element
 * @example
 * ```tsx
 * <div className="row" {...buttonProps(() => onSelect(id))}>…</div>
 * ```
 */
export function buttonProps(
  onActivate: () => void,
  { doubleClick = false }: { doubleClick?: boolean } = {},
): ButtonProps {
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onActivate();
  };
  return doubleClick
    ? { role: "button", tabIndex: 0, onDoubleClick: onActivate, onKeyDown }
    : { role: "button", tabIndex: 0, onClick: onActivate, onKeyDown };
}
