import { registerSources } from "@noverax/courier";

import { accountsApi } from "../../lib/api";
import { catalog } from "../../lib/catalog";

export default defineNitroPlugin(() => {
  registerSources({ accounts: accountsApi, catalog });
});
