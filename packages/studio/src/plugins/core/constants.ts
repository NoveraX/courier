/** Virtual module ID used by Rollup to inject the Studio connect snippet */
export const VIRTUAL_ID = "virtual:courier-studio-init";

/** Resolved (internal) module ID — prefixed with \0 to mark as virtual */
export const RESOLVED_ID = `\0${VIRTUAL_ID}`;
