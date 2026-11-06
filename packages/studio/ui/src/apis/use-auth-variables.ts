import { useEffect, useState } from "react";

import { authVariables } from "@/apis/client";
import { type AuthDraft, variablesOf } from "@/features/apis/import-auth-draft";
import { studioToken } from "@/lib/studio-token";

/* Asked once typing stops. */
const SETTLE_MS = 300;
/* Studio refuses a list with any other name in it; only names it could look up are asked for. */
const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/;

/**
 * Whether Studio's environment sets each variable an import's auth names,
 * asked once the user stops typing. A page Studio answers no such question
 * for — one without the project's token, a demo's — is told nothing, and
 * its fields say nothing.
 *
 * @param auth - The auth as filled in
 * @returns Each variable Studio answered for, set or not
 * @example
 * ```tsx
 * const set = useAuthVariables(auth);
 * set.get("ORDERS_SPEC_TOKEN"); // → true, false, or undefined before Studio answers
 * ```
 */
export function useAuthVariables(auth: AuthDraft): ReadonlyMap<string, boolean> {
  const [answered, setAnswered] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const asked = variablesOf(auth)
    .filter((name) => VARIABLE.test(name))
    .join("\n");
  useEffect(() => {
    /* Studio answers only a page with the project's token. */
    if (asked === "" || studioToken() === null) return;
    let current = true;
    const timer = setTimeout(() => {
      authVariables(asked.split("\n")).then(
        (variables) => {
          if (current) setAnswered(new Map(variables.map((v) => [v.name, v.set])));
        },
        () => {
          if (current) setAnswered(new Map());
        },
      );
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [asked]);
  return answered;
}
