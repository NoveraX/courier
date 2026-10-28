import { CourierError } from "@noverax/courier";

/** The builder an app was found building with. */
export interface UnsupportedBuilderContext extends Record<string, unknown> {
  /** What Nuxt's `builder` option names. */
  builder: string;
}

/**
 * The routes module was added to an app that builds with another builder
 * than Nuxt's Vite one, under which alone it builds a page's routes.
 *
 * @example
 * ```ts
 * throw new UnsupportedBuilderError("@nuxt/webpack-builder");
 * ```
 */
export class UnsupportedBuilderError extends CourierError<"UNSUPPORTED_BUILDER"> {
  declare readonly context: UnsupportedBuilderContext;

  /**
   * @param builder - The builder the app builds with
   */
  constructor(builder: string) {
    super(
      `[courier] courierRoutesModule builds the routes under Nuxt's Vite builder, and this app builds with ${builder}: give its proxy clients the routes module \`npx @noverax/courier-cli routes\` writes instead.`,
      { code: "UNSUPPORTED_BUILDER", context: { builder } },
    );
  }
}
