/**
 * The header the site's server names a call's visitor in: their address,
 * which Courier reads from the request it is serving — past this machine,
 * private networks and the proxies `COURIER_TRUSTED_PROXIES` names, or
 * from the header `COURIER_CLIENT_ADDRESS_HEADER` names on a request such
 * a proxy passed on — and sends to the backend alone, as the site's
 * sources ask in `forward.clientAddress`. Only the site's server reaches
 * the backend, so the backend takes the header as it comes.
 */
export const VISITOR_ADDRESS_HEADER = "x-visitor-address"
