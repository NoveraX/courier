interface CourierLogoProps {
  /** The product line under the wordmark: `Studio`. */
  product: string;
}

/**
 * The Courier mark and wordmark, with the product named beneath.
 *
 * The mark is one path filled with the text colour, so it follows the theme.
 *
 * @param props - The product's name
 * @returns The logo
 * @example
 * ```tsx
 * <CourierLogo product="Studio" />
 * ```
 */
export function CourierLogo({ product }: CourierLogoProps): React.ReactNode {
  return (
    <span className="flex items-center gap-2 text-fg">
      <svg
        viewBox="0 0 212 180"
        aria-hidden="true"
        focusable="false"
        className="block w-7 shrink-0"
      >
        <path
          fill="currentColor"
          d="M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z"
        />
      </svg>
      <span className="flex flex-col gap-0.5">
        <span className="font-wordmark text-wordmark leading-[0.85] tracking-wordmark">
          courier
        </span>
        <span className="pl-px text-micro font-strong leading-none tracking-[-0.01em] text-fg-muted">
          {product}
        </span>
      </span>
    </span>
  );
}
