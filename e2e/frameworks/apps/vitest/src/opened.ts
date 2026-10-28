import { routes } from "@noverax/courier/routes";

/* The endpoints of the catalog a page may call, as the routes the plugin built name them. */
export const opened = (): string => Object.keys(routes.catalog?.endpoints ?? {}).join(",");
