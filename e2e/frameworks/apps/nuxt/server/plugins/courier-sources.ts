import { registerSources } from "@noverax/courier";

import { accountsApi } from "../../lib/api";

export default defineNitroPlugin(() => {
  registerSources({ accounts: accountsApi });
});
