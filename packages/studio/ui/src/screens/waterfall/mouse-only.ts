/**
 * A pointer handler that answers a mouse alone. A finger's tap fires
 * pointer events too, but leaves no pointer behind to move off again, so a
 * tooltip or the time cursor it called up would stay on screen — over the
 * inspector the same tap opens.
 *
 * @param handler - What the mouse's event does
 * @returns The handler, ignoring a finger or a pen
 * @example
 * ```tsx
 * <span onPointerMove={mouseOnly((e) => showTip(e.clientX, e.clientY))} />
 * ```
 */
export function mouseOnly<TElement extends Element>(
  handler: (event: React.PointerEvent<TElement>) => void,
): (event: React.PointerEvent<TElement>) => void {
  return (event) => {
    if (event.pointerType === "mouse") handler(event);
  };
}
