import { defineConfig } from "@noverax/courier/config";

import { payments, shop, vendorApi } from "./apis";

export default defineConfig({ sources: { shop, payments, vendor: vendorApi({}) } });
