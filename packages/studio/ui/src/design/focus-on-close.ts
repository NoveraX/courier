/**
 * Where an overlay leaves the focus as it closes: where it has already
 * gone, or else back on what opened the overlay. Radix gives the focus back
 * a moment after the overlay has left the page, and a focus that moved in
 * that moment — a click into an editor, a script, a test typing straight on
 * — would be taken from where it went, and the keys that followed would
 * land on the button that opened the overlay. A focus already on another
 * element stays there; one that fell to the page with the overlay goes back
 * to the overlay's trigger, or to `returnTo` for an overlay opened from
 * outside it.
 *
 * @param event - The overlay's auto-focus event as it closes
 * @param returnTo - What takes the focus back in place of the overlay's trigger
 * @example
 * ```tsx
 * <Popover.Content onCloseAutoFocus={focusOnClose}>…</Popover.Content>
 * <Dialog.Content onCloseAutoFocus={(event) => focusOnClose(event, menuButton)}>…</Dialog.Content>
 * ```
 */
export function focusOnClose(event: Event, returnTo?: React.RefObject<HTMLElement | null>): void {
  const focused = document.activeElement;
  if (focused !== null && focused !== document.body) {
    event.preventDefault();
    return;
  }
  if (returnTo === undefined) return;
  event.preventDefault();
  returnTo.current?.focus();
}
