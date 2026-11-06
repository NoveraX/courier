import { urlWithoutSecrets } from "@noverax/courier/internal";
import { useEffect } from "react";
import { create } from "zustand";

import {
  type AuthDraft,
  type HeaderVariable,
  MAX_AUTH_HEADERS,
  NO_AUTH,
} from "@/features/apis/import-auth-draft";
import { INITIAL_IMPORT_STATE } from "@/features/apis/initial-import-state";
import type { ImportSource, ImportState } from "@/features/apis/types-generate";
import { isPlainObject } from "@/socket/is-plain-object";

/* A pasted spec is kept while it is small; a large one, or a file, is picked again. */
const KEPT_TEXT_CHARS = 64 * 1024;
/* A variable's name as names are written: a value pasted in its place, which has lower case, is not kept. */
const KEPT_VARIABLE = /^[A-Z_][A-Z0-9_]{0,255}$/;
const KEPT_HEADER_CHARS = 128;

/** An API import left unfinished: where its spec comes from, and the address or text typed. */
export interface KeptImport {
  source: ImportSource;
  content: string;
  /** Read from the calls Studio recorded, pasted as raw. */
  fromTraffic?: boolean | undefined;
  /** For an address: the auth it is read with, the variables named, never a value. */
  auth?: AuthDraft | undefined;
}

function keptVariable(name: unknown): string {
  return typeof name === "string" && KEPT_VARIABLE.test(name.trim()) ? name.trim() : "";
}

function keptHeaders(rows: unknown): HeaderVariable[] {
  const kept = (Array.isArray(rows) ? rows : [])
    .slice(0, MAX_AUTH_HEADERS)
    .filter(isPlainObject)
    .map((row) => ({
      name: typeof row.name === "string" ? row.name.slice(0, KEPT_HEADER_CHARS) : "",
      variable: keptVariable(row.variable),
    }));
  return kept.length > 0 ? kept : NO_AUTH.headers;
}

/* The auth's kind and the names it gives; none for no auth. */
function keptAuth(raw: unknown): AuthDraft | undefined {
  if (!isPlainObject(raw)) return undefined;
  const { kind } = raw;
  if (kind !== "bearer" && kind !== "basic" && kind !== "header") return undefined;
  return {
    kind,
    token: keptVariable(raw.token),
    username: keptVariable(raw.username),
    password: keptVariable(raw.password),
    headers: keptHeaders(raw.headers),
  };
}

/**
 * The API import left unfinished, kept in the project: the import wizard
 * opens with it again, here or in another browser, until a write ends it.
 *
 * @example
 * ```ts
 * useKeptImport.setState({ kept: keptImport("url", "https://api.example/openapi.json") });
 * ```
 */
export const useKeptImport = create<{ kept: KeptImport | null }>(() => ({ kept: null }));

/**
 * What of an unfinished import is worth keeping: an address with the
 * variables its auth names, or a pasted spec while it is small. A file is
 * not kept — it is picked again — nor is an empty field, nor an address
 * that carries a credential, nor a variable's name that is not written as
 * one: what is kept is shown to every page of the project, a page without
 * its token too.
 *
 * @param source - Where the spec comes from
 * @param content - The address or text typed
 * @param fromTraffic - Whether the pasted spec was read from the calls Studio recorded
 * @param auth - The auth an address is read with
 * @returns What to keep, or `null` when nothing is
 * @example
 * ```ts
 * keptImport("file", "openapi: 3.1.0"); // → null
 * ```
 */
export function keptImport(
  source: ImportSource,
  content: string,
  fromTraffic = false,
  auth: AuthDraft = NO_AUTH,
): KeptImport | null {
  if (source === "file" || content.trim() === "") return null;
  if (source === "url" && urlWithoutSecrets(content) !== content) return null;
  if (source === "raw" && content.length > KEPT_TEXT_CHARS) return null;
  const keptRefs = source === "url" ? keptAuth(auth) : undefined;
  return {
    source,
    content,
    ...(source === "raw" && fromTraffic && { fromTraffic: true }),
    ...(keptRefs !== undefined && { auth: keptRefs }),
  };
}

/**
 * Read a kept import, as the project keeps it.
 *
 * @param raw - What the project keeps
 * @returns The import, or `null` for none of its shape
 * @example
 * ```ts
 * readKeptImport({ source: "url", content: "https://api.example/openapi.json" });
 * ```
 */
export function readKeptImport(raw: unknown): KeptImport | null {
  if (!isPlainObject(raw) || typeof raw.content !== "string") return null;
  if (raw.source !== "url" && raw.source !== "raw") return null;
  return keptImport(raw.source, raw.content, raw.fromTraffic === true, keptAuth(raw.auth));
}

/**
 * The import wizard as it opens: on the import left unfinished, with what
 * was typed, unless another source is asked for.
 *
 * @param source - The source asked for, if one is
 * @returns The wizard's state
 * @example
 * ```ts
 * setState(openedImport("raw"));
 * ```
 */
export function openedImport(source?: ImportSource): ImportState {
  const { kept } = useKeptImport.getState();
  const resume = kept !== null && (source === undefined || source === kept.source);
  return {
    ...INITIAL_IMPORT_STATE,
    source: resume ? kept.source : (source ?? "url"),
    content: resume ? kept.content : "",
    auth: (resume && kept.auth) || INITIAL_IMPORT_STATE.auth,
    fromTraffic: resume && kept.fromTraffic === true,
  };
}

/**
 * Keep what is typed in the open wizard, until a write ends the import.
 *
 * @param open - Whether the wizard is open
 * @param state - The wizard's state
 * @example
 * ```ts
 * useKeepImport(open, state);
 * ```
 */
export function useKeepImport(
  open: boolean,
  { source, content, fromTraffic, auth }: ImportState,
): void {
  useEffect(() => {
    if (open) useKeptImport.setState({ kept: keptImport(source, content, fromTraffic, auth) });
  }, [open, source, content, fromTraffic, auth]);
}
