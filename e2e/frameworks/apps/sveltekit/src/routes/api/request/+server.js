import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-sveltekit";

import { catalog } from "$lib/catalog.js";

/* The proxy a page's client built from the routes calls, serving the API they come from. */
registerSources({ catalog });

const handler = courierHandler();
export const GET = handler;
export const POST = handler;
