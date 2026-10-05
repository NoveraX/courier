/**
 * Where each part of the demo listens. Each moves with an environment
 * variable, so the demo runs beside other servers on one machine.
 */

function portOf(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name}=${raw} is not a port`);
  }
  return port;
}

/** The ports of Studio, the shop's server, both upstreams and both mocks, on 127.0.0.1 but Studio. */
export const PORTS = {
  studio: portOf("STUDIO_PORT", 6280),
  app: portOf("APP_PORT", 3001),
  shop: portOf("SHOP_PORT", 4501),
  payments: portOf("PAYMENTS_PORT", 4502),
  shopMock: portOf("SHOP_MOCK_PORT", 7101),
  paymentsMock: portOf("PAYMENTS_MOCK_PORT", 7102),
} as const;
