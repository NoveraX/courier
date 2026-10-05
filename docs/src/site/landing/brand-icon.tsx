/**
 * A brand's mark, filled with the current text colour.
 *
 * @param props - The mark's path, on a 24 × 24 box, and its classes
 * @returns The mark
 * @example
 * ```tsx
 * <BrandIcon path={brand.path} className="size-5" />
 * ```
 */
export function BrandIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path fill="currentColor" d={path} />
    </svg>
  )
}
