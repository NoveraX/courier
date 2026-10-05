import { HTTPError } from "@noverax/courier";

/**
 * Make a call a shopper makes, and go on whatever it answers: a failed call
 * is traffic Studio shows like any other. One that could not be sent at all
 * — the shop's server restarting, say — is reported.
 *
 * @param call - The call
 * @returns Its answer, or `undefined` when it failed
 * @example
 * ```ts
 * const order = await attempt(() => storefront.orders.place({ shopper }));
 * ```
 */
export async function attempt<TAnswer>(call: () => Promise<TAnswer>): Promise<TAnswer | undefined> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof HTTPError)) console.warn("A shopper's call was not sent:", error);
    return undefined;
  }
}
