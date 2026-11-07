/**
 * A framework's program for the tests to prepare a project with, run as
 * `node fake-printing-tool.mjs <output> <program> <argument...>`: it
 * prints what a program printed as it failed — Vite's own output, kept
 * from a build of a project with a module it could not find — and ends
 * with status 1.
 */
import { readFileSync } from "node:fs";

const [output = ""] = process.argv.slice(2);

process.stderr.write(readFileSync(output, "utf8"));
process.exitCode = 1;
