import { readFile } from "node:fs/promises"
import path from "node:path"

import type { ImageResponse } from "next/og"

type ImageFonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>

/* The geist package ships each face as TrueType, which the card renderer reads. */
const FONTS = path.join(process.cwd(), "node_modules/geist/dist/fonts")

let fonts: Promise<ImageFonts> | undefined

async function readFonts(): Promise<ImageFonts> {
  const [regular, semibold, mono] = await Promise.all([
    readFile(path.join(FONTS, "geist-sans/Geist-Regular.ttf")),
    readFile(path.join(FONTS, "geist-sans/Geist-SemiBold.ttf")),
    readFile(path.join(FONTS, "geist-mono/GeistMono-Regular.ttf")),
  ])
  return [
    { name: "Geist", data: regular, weight: 400, style: "normal" },
    { name: "Geist", data: semibold, weight: 600, style: "normal" },
    { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
  ]
}

/**
 * The faces a social card is set in — Geist, as the site is, and Geist
 * Mono for the page's address — read once where the site is built, for
 * every card drawn there.
 *
 * @returns The fonts, for the card renderer
 * @example
 * ```ts
 * new ImageResponse(card, { width: 1200, height: 630, fonts: await ogFonts() })
 * ```
 */
export function ogFonts(): Promise<ImageFonts> {
  fonts ??= readFonts()
  return fonts
}
