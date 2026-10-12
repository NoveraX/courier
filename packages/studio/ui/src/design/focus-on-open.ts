/**
 * Where a dialog puts the focus as it opens. Opened from the keyboard, it
 * lets the focus go to its first control, ringed to show the way on.
 * Opened with a tap or a click, it takes the focus itself: Safari rings a
 * control a script focuses even after a tap, and a ring on a close button
 * nobody went to reads as if it were chosen. A control in the dialog that
 * focuses itself as it appears keeps the focus either way.
 *
 * @param event - The dialog's auto-focus event as it opens
 * @example
 * ```tsx
 * <Dialog.Content onOpenAutoFocus={focusOnOpen}>…</Dialog.Content>
 * ```
 */
export function focusOnOpen(event: Event): void {
  const opener = document.activeElement;
  if (opener instanceof HTMLElement && opener.matches(":focus-visible")) return;
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus();
}
