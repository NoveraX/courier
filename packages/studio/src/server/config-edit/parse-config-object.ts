import { type ParsedSource, parseSource } from "@noverax/courier-cli/devkit";
import type { ObjectExpression } from "oxc-parser";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { locateConfigObject } from "./locate-config-object";

/** A config read as code, and the object literal it exports. */
export interface ParsedConfig {
  parsed: ParsedSource;
  config: ObjectExpression;
}

/**
 * Read a config as code and find the object literal it exports, for Studio
 * to change in place.
 *
 * @param configName - The config's file name, as the messages name it
 * @param text - The config's text
 * @returns The parsed config, and the object it exports
 * @throws {ConfigEditRefusal} `CONFIG_UNREADABLE` when it does not parse, `CONFIG_SHAPE` when it exports no object Studio finds
 * @example
 * ```ts
 * const { parsed, config } = parseConfigObject("courier.config.ts", text);
 * findConfigList(config, "sources", parsed.program);
 * ```
 */
export function parseConfigObject(configName: string, text: string): ParsedConfig {
  const parsed = parseSource(configName, text);
  if (parsed.problem !== null) {
    const why = `${configName} does not parse (${parsed.problem.message})`;
    throw new ConfigEditRefusal("CONFIG_UNREADABLE", `${why}, so Studio cannot change it.`);
  }
  const located = locateConfigObject(parsed.program);
  if (located.kind === "other") {
    throw new ConfigEditRefusal("CONFIG_SHAPE", `${configName} ${located.what}.`);
  }
  return { parsed, config: located.object };
}
