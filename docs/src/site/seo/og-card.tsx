import { ImageResponse } from "next/og"

import { OG_COLORS, OgFooter, OgWordmark } from "./og-card-parts"
import { ogFonts } from "./og-fonts"
import { OG_IMAGE_SIZE } from "./og-image"
import { clipText, headlineSize } from "./og-text"
import type { PageCard } from "./page-cards"

/* About two lines at the description's size, cut on a word. */
const DESCRIPTION_LENGTH = 150

function Card({ card, path }: { card: PageCard; path: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "60px 64px 52px",
        position: "relative",
        background: OG_COLORS.bg,
        color: OG_COLORS.fg,
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -300,
          left: 300,
          width: 1000,
          height: 620,
          background: "radial-gradient(ellipse at center, rgba(125,185,255,0.14), transparent 62%)",
        }}
      />
      <OgWordmark />
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}
      >
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: OG_COLORS.brand }}>
          {card.eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            maxWidth: 1040,
            fontSize: headlineSize(card.headline),
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: "-0.035em",
          }}
        >
          {card.headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            maxWidth: 1000,
            fontSize: 28,
            lineHeight: 1.42,
            color: OG_COLORS.fgMuted,
          }}
        >
          {clipText(card.description, DESCRIPTION_LENGTH)}
        </div>
      </div>
      <OgFooter path={path} />
    </div>
  )
}

/**
 * A page's social card: the page's section, its title and what it covers,
 * over the site's address for it — drawn in the site's dark theme and set
 * in Geist.
 *
 * @param card - What the card says
 * @param path - The page's address
 * @returns The card, as a PNG response
 * @example
 * ```ts
 * return ogCard({ eyebrow: "Getting Started", headline: "Quick Start", description: "…" }, "/docs/quick-start")
 * ```
 */
export async function ogCard(card: PageCard, path: string): Promise<ImageResponse> {
  return new ImageResponse(<Card card={card} path={path} />, {
    ...OG_IMAGE_SIZE,
    fonts: await ogFonts(),
  })
}
