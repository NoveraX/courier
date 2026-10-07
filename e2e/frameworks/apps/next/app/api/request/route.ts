import { registerSources } from "@noverax/courier";
import { apiRoute } from "@noverax/courier-next";

import { api } from "../../../lib/api";

registerSources({ accounts: api });

export const { GET, POST } = apiRoute();
