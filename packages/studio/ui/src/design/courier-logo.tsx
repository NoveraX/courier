import { CourierMark } from "./courier-mark";

/* The mark's own box, none of the room the icon keeps around it: the two lines of type beside it set its height. */
const MARK_BOX = "0 0 212 180";

interface CourierLogoProps {
  /** The product line under the wordmark: `Studio`. */
  product: string;
}

/**
 * The Courier mark and wordmark, with the product named beneath.
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
      <CourierMark viewBox={MARK_BOX} className="block w-7 shrink-0" />
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
