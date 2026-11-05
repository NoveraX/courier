/**
 * The words a failure is answered with, as a page's bundle has them: the
 * error's message as it was. A page answers no request, so no `Response`
 * it makes reaches anyone but the page, and a credential in the message is
 * the page's own. A bundler that builds for the browser takes this module
 * in place of the one that cuts credentials out of the message.
 *
 * @param message - The error's message
 * @returns The message, as it was
 * @example
 * ```ts
 * answeredMessage("Request refused"); // → "Request refused"
 * ```
 */
export function answeredMessage(message: string): string {
  return message;
}
