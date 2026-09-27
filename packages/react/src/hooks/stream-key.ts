/** Which stream or channel a realtime hook has open. */
export interface StreamKey {
  /** Differs whenever the group, the method or the variables do */
  key: string;
  /** The variables serialised, so an effect re-runs on a change of value only */
  variablesKey: string | undefined;
}

/**
 * Name the stream a realtime hook opens for a group, method and variables.
 *
 * Equal variables written as a new object each render give the same key, so
 * neither the connection nor the state it has gathered is thrown away.
 *
 * @param group - API group name
 * @param method - Endpoint method name
 * @param variables - The variables the stream is opened with
 * @returns The stream's key and its serialised variables
 * @example
 * streamKeyOf("live", "ticks", { n: 3 }); // { key: '["live","ticks",{"n":3}]', variablesKey: '{"n":3}' }
 */
export function streamKeyOf(group: string, method: string, variables: unknown): StreamKey {
  const variablesKey: string | undefined = JSON.stringify(variables);
  return { key: JSON.stringify([group, method, variables ?? null]), variablesKey };
}
