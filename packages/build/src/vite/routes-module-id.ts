/** What a page imports its routes by: the module the package ships, which the plugin answers. */
export const ROUTES_SPECIFIER = "@noverax/courier/routes";

/**
 * The module the plugin answers it with. A virtual id, so no environment
 * takes it for an installed file to load as it is, and a server's bundle
 * builds it in as the page's does.
 */
export const ROUTES_MODULE_ID = "\0@noverax/courier/routes";

/** Exactly the specifier: a path that merely begins with it is another module. */
export const ROUTES_PATTERN = /^@noverax\/courier\/routes$/;
