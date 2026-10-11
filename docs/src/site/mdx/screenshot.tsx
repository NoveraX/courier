import Image from "next/image"

import { cn } from "@/site/cn"

interface ScreenshotProps {
  /** The image's path under `public/` without its theme: `/images/vscode/lens` for `lens-dark.png` and `lens-light.png` */
  src: string
  /** What the screenshot shows, for a reader who cannot see it */
  alt: string
  /** Its width in CSS pixels; the files are twice as large, for sharp screens */
  width: number
  /** Its height in CSS pixels */
  height: number
  /** A line under it */
  caption?: string
}

/* The page's own width, so a screen loads no larger an image than it shows. */
const SIZES = "(min-width: 1280px) 760px, (min-width: 768px) 70vw, 100vw"

/**
 * A screenshot taken in both of the site's themes, framed like the site's
 * code panels: the one that matches the page is shown, the other is not
 * loaded until the reader switches.
 *
 * @param props - Where its two images are, what they show, their size and a caption
 * @returns The figure
 * @example
 * ```tsx
 * <Screenshot src="/images/vscode/lens" alt="Calls above each call" width={940} height={620} />
 * ```
 */
export function Screenshot({ src, alt, width, height, caption }: ScreenshotProps) {
  const image = "h-auto w-full"
  /* A shot narrower than the page shows at its own size, centred; a wider one fills the page. */
  return (
    <figure className="mx-auto my-6" style={{ maxWidth: width }}>
      <div className="overflow-hidden rounded-panel border border-line bg-panel shadow-panel">
        <Image
          src={`${src}-dark.png`}
          alt={alt}
          width={width}
          height={height}
          sizes={SIZES}
          className={cn(image, "block [[data-theme=light]_&]:hidden")}
        />
        <Image
          src={`${src}-light.png`}
          alt={alt}
          width={width}
          height={height}
          sizes={SIZES}
          className={cn(image, "hidden [[data-theme=light]_&]:block")}
        />
      </div>
      {caption ? (
        <figcaption className="mt-2.5 text-center text-small text-fg-subtle">{caption}</figcaption>
      ) : null}
    </figure>
  )
}
