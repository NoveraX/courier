/**
 * SVG <defs> for explorer graph edges — gradients, glow filters, markers.
 * Rendered once inside <ReactFlow> as a child; referenced by animated-edge via url(#id).
 *
 * Uses CSS custom properties for theme-awareness.
 */
export function EdgeDefinitions(): React.ReactElement {
  return (
    <svg className="absolute" width={0} height={0}>
      <defs>
        {/* ── Gradient: source → group (indigo → violet) ──────────────── */}
        <linearGradient id="edge-grad-source" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: "var(--graph-edge-source)" }} />
          <stop offset="100%" style={{ stopColor: "var(--graph-edge-group)" }} />
        </linearGradient>

        {/* ── Gradient: group → endpoint (violet → sky) ───────────────── */}
        <linearGradient id="edge-grad-group" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: "var(--graph-edge-group)" }} />
          <stop offset="100%" style={{ stopColor: "var(--graph-edge-endpoint)" }} />
        </linearGradient>

        {/* ── Gradient: error edges (rose tinted) ─────────────────────── */}
        <linearGradient id="edge-grad-error" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.65 0.16 29)" />
          <stop offset="100%" stopColor="oklch(0.55 0.19 29)" />
        </linearGradient>

        {/* ── Glow filter for active edges ─────────────────────────────── */}
        <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* ── Stronger glow for flowing particles ──────────────────────── */}
        <filter id="particle-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
