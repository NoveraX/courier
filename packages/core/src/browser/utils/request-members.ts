/**
 * What a request the core builds names beside what it says itself, as a
 * page's bundle has it: nothing. A browser reads a request's init alone,
 * which stands on no prototype, and builds no objects of it that read what it
 * does not name of `Object.prototype`, as Node's `fetch` does; a bundler that
 * builds for the browser takes this module in place of the server's.
 */
export const REQUEST_MEMBERS: RequestInit | undefined = undefined;
