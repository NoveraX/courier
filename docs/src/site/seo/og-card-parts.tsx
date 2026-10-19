import { COURIER_MARK_PATH } from "@/site/courier-mark"
import { SITE_URL } from "@/site/site-url"

/** The site's dark theme, which every card is drawn in, as the home page's is. */
export const OG_COLORS = {
  bg: "#08090a",
  surface: "#101114",
  line: "rgba(255,255,255,0.12)",
  fg: "#f7f8f8",
  fgMuted: "#a8aeb7",
  fgSubtle: "#9096a0",
  brand: "#7db9ff",
} as const

/**
 * Courier's mark and name, as a card's heading.
 *
 * @returns The wordmark
 * @example
 * ```tsx
 * <OgWordmark />
 * ```
 */
export function OgWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
      <svg aria-hidden="true" viewBox="0 0 212 180" width={38} height={32}>
        <path fill={OG_COLORS.fg} d={COURIER_MARK_PATH} />
      </svg>
      courier
    </div>
  )
}

/**
 * A card's foot: the page's address, cut short when it is long, and the
 * command that sets Courier up.
 *
 * @param props - The page's address
 * @returns The foot
 * @example
 * ```tsx
 * <OgFooter path="/docs/quick-start" />
 * ```
 */
export function OgFooter({ path }: { path: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <div
        style={{
          display: "block",
          flexShrink: 1,
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          fontFamily: "Geist Mono",
          fontSize: 22,
          color: OG_COLORS.fgSubtle,
        }}
      >
        {`${new URL(SITE_URL).host}${path}`}
      </div>
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          marginLeft: "auto",
          alignItems: "center",
          height: 48,
          padding: "0 20px",
          border: `1px solid ${OG_COLORS.line}`,
          borderRadius: 10,
          background: OG_COLORS.surface,
          color: OG_COLORS.fgMuted,
          fontFamily: "Geist Mono",
          fontSize: 21,
        }}
      >
        $&nbsp;<span style={{ color: OG_COLORS.fg }}>npx @noverax/create-courier</span>
      </div>
    </div>
  )
}
