const PADDING = 6;
const RADIUS = 10;

interface TourOverlayProps {
  rect: DOMRect;
  onClose: () => void;
}

/**
 * Full-screen SVG overlay with a cutout hole around the target element.
 * Click outside the cutout to dismiss the tour.
 */
export function TourOverlay({ rect, onClose }: TourOverlayProps): React.ReactElement {
  const x = rect.x - PADDING;
  const y = rect.y - PADDING;
  const w = rect.width + PADDING * 2;
  const h = rect.height + PADDING * 2;

  return (
    <svg
      className="fixed inset-0 size-full"
      onClick={onClose}
      aria-hidden
    >
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={RADIUS} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="oklch(0.13 0.01 264 / 0.7)"
        mask="url(#tour-mask)"
      />
      {/* Glow ring around cutout */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={RADIUS}
        fill="none"
        stroke="oklch(0.65 0.18 280 / 0.5)"
        strokeWidth={2}
      />
    </svg>
  );
}
