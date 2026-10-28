import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-astro";

import { catalog } from "../../lib/catalog.mjs";

/* Rendered on demand: the proxy a page's client built from the routes calls. */
export const prerender = false;

registerSources({ catalog });

const handler = courierHandler();
export const GET = handler;
export const POST = handler;
