import { Plus, X } from "lucide-react";

import { useAuthVariables } from "@/apis/use-auth-variables";
import { Segmented, type SegmentedOption } from "@/design/segmented";
import {
  type AuthDraft,
  type AuthKind,
  type HeaderVariable,
  MAX_AUTH_HEADERS,
} from "@/features/apis/import-auth-draft";
import { VariableInput } from "./variable-input";

const KINDS: readonly SegmentedOption<AuthKind>[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer" },
  { value: "basic", label: "Basic" },
  { value: "header", label: "Header" },
];

interface HeaderRowsProps {
  headers: HeaderVariable[];
  set: ReadonlyMap<string, boolean>;
  onChange: (headers: HeaderVariable[]) => void;
}

/* The headers a header auth sends, each with the variable that holds its value. */
function HeaderRows({ headers, set, onChange }: HeaderRowsProps): React.ReactNode {
  const change = (at: number, part: Partial<HeaderVariable>) =>
    onChange(headers.map((row, i) => (i === at ? { ...row, ...part } : row)));
  return (
    <div className="flex flex-col gap-2">
      {headers.map((row, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a header's row is its place in the list, its name typed in it
        <div key={at} className="flex items-center gap-2 max-sm:flex-wrap">
          <input
            value={row.name}
            onChange={(e) => change(at, { name: e.target.value })}
            placeholder="X-Api-Key"
            aria-label={`Header ${at + 1}`}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="h-9.5 w-40 min-w-0 rounded-[9px] border border-line-strong bg-inset px-3 font-mono text-control text-fg outline-none placeholder:text-fg-subtle focus:border-brand max-sm:w-full pointer-coarse:h-11 pointer-coarse:text-[16px]"
          />
          <VariableInput
            label="Variable"
            placeholder="ORDERS_API_KEY"
            value={row.variable}
            set={set}
            onChange={(variable) => change(at, { variable })}
          />
          {headers.length > 1 && (
            <button
              type="button"
              aria-label={`Remove header ${at + 1}`}
              onClick={() => onChange(headers.filter((_, i) => i !== at))}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-fg-subtle hover:bg-inset hover:text-fg"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {headers.length < MAX_AUTH_HEADERS && (
        <button
          type="button"
          onClick={() => onChange([...headers, { name: "", variable: "" }])}
          className="flex w-fit cursor-pointer items-center gap-1.5 text-small font-strong text-brand hover:underline"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add header
        </button>
      )}
    </div>
  );
}

interface ImportAuthFieldsProps {
  auth: AuthDraft;
  onChange: (auth: AuthDraft) => void;
}

/**
 * The auth a spec behind one is read with: its kind, and the environment
 * variable that holds each credential — set where Studio runs, or in a
 * `.env` file of the project — with whether Studio's environment sets it.
 * A value is never typed here, so none reaches the page.
 *
 * @param props - The auth as filled in, and what changing it does
 * @returns The fields
 * @example
 * ```tsx
 * <ImportAuthFields auth={state.auth} onChange={wizard.setAuth} />
 * ```
 */
export function ImportAuthFields({ auth, onChange }: ImportAuthFieldsProps): React.ReactNode {
  const set = useAuthVariables(auth);
  const patch = (part: Partial<AuthDraft>) => onChange({ ...auth, ...part });
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-control font-strong">Authentication</span>
        <Segmented
          label="Authentication"
          options={KINDS}
          value={auth.kind}
          onChange={(kind) => patch({ kind })}
          quiet="subtle"
        />
      </div>
      {auth.kind !== "none" && (
        <p className="m-0 text-small text-fg-subtle">
          Name the environment variable that holds each credential, set where Studio runs or in a
          .env file of the project. Studio reads it when it fetches the spec, and courier.config
          names the same variables; no value reaches this page.
        </p>
      )}
      {auth.kind === "bearer" && (
        <VariableInput
          label="Token variable"
          placeholder="ORDERS_SPEC_TOKEN"
          value={auth.token}
          set={set}
          onChange={(token) => patch({ token })}
        />
      )}
      {auth.kind === "basic" && (
        <div className="flex gap-2 max-sm:flex-col">
          <VariableInput
            label="User variable"
            placeholder="SPEC_USER"
            value={auth.username}
            set={set}
            onChange={(username) => patch({ username })}
          />
          <VariableInput
            label="Password variable"
            placeholder="SPEC_PASSWORD"
            value={auth.password}
            set={set}
            onChange={(password) => patch({ password })}
          />
        </div>
      )}
      {auth.kind === "header" && (
        <HeaderRows headers={auth.headers} set={set} onChange={(headers) => patch({ headers })} />
      )}
    </div>
  );
}
