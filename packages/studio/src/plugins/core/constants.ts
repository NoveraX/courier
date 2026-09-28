/** Virtual module that carries the Studio connect snippet into a bundle */
export const VIRTUAL_ID = "virtual:courier-studio-init";

/** Resolved (internal) module ID — prefixed with \0 to mark as virtual */
export const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** The package that carries the Studio runtime */
export const RUNTIME_PACKAGE = "@noverax/courier-studio-core";

/** The module the connect snippet imports `attachRuntime` from */
export const RUNTIME_SPECIFIER = `${RUNTIME_PACKAGE}/runtime`;
