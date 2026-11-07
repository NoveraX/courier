import { registerSources } from "@noverax/courier/server";
import handler from "@tanstack/react-start/server-entry";

import { catalog } from "./lib/catalog";

/* The APIs the proxy route serves, registered where only the server loads them. */
registerSources({ catalog });

export default handler;
