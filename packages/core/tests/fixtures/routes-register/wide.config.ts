import type { CourierConfig } from "@noverax/courier/config";

import { payments, shop } from "./apis";

/* Annotated as CourierConfig, which types its sources as any record of APIs. */
const config: CourierConfig = { sources: { shop, payments } };

export default config;
