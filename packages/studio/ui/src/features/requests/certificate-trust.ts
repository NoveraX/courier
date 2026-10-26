/**
 * What fixes a TLS certificate Node.js did not trust, whoever's request
 * met it: an authority of the user's own — a company's, a VPN's, a proxy's
 * that inspects traffic — given to Node.js, or a certificate fixed on the
 * server that sent it.
 *
 * @param server - The server, as the advice names it
 * @returns The advice
 * @example
 * ```ts
 * certificateTrust("the server"); // "A self-signed certificate, … needs fixing on the server."
 * ```
 */
export function certificateTrust(server: string): string {
  return `A self-signed certificate, or one from a private authority — a company's, or that of a VPN or a proxy that inspects traffic — needs that authority given to Node.js through NODE_EXTRA_CA_CERTS — or, when this machine already trusts it, through NODE_USE_SYSTEM_CA=1, which Node.js reads from 22.19 and 24.6 on; an expired, revoked or not yet valid certificate, or one issued for another host name, needs fixing on ${server}.`;
}
