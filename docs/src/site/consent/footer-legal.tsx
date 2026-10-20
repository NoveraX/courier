import Link from "next/link"

import { PRIVACY_PATH } from "@/site/legal/legal-paths"
import { CookieSettingsButton } from "./cookie-settings-button"

/**
 * What every footer of the site ends its licence with: the privacy notice,
 * and Cookie settings, set in the footer's own link class.
 *
 * @param props - The class of the footer's links
 * @returns The two entries
 * @example
 * ```tsx
 * <FooterLegal className="-my-1 py-1 hover:text-fg" />
 * ```
 */
export function FooterLegal({ className }: { className: string }) {
  return (
    <>
      <Link href={PRIVACY_PATH} className={className}>
        Privacy
      </Link>
      <CookieSettingsButton className={className} />
    </>
  )
}
