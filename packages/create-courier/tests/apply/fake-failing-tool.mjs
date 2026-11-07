/**
 * A framework's program for the tests to prepare a project with, run as
 * `node fake-failing-tool.mjs <program> <argument...>`, as `astro sync`
 * runs: it throws as a program does that cannot read the project, so
 * Node prints the error and its stack, and it ends with status 1.
 */
const [program, ...args] = process.argv.slice(2);

throw new Error(`${[program, ...args].join(" ")} could not read the project's config`);
