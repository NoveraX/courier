import { ConfigurationError, type ConfigurationErrorCode } from "../errors/configuration-error";
import { dataCopy } from "./plain-data";

/** An option a server checks, read once. */
export interface ReadOption {
  /** What it is an option of: the API's options, or an endpoint's */
  readonly owner: object;
  readonly key: string;
  /** Its property, as the owner had it */
  readonly own: PropertyDescriptor | undefined;
  /** The copy of its value, which the checks read and a server holds in its place */
  readonly copy: unknown;
  /** The code it is refused with, and what the refusal names it and what it is of */
  readonly code: ConfigurationErrorCode;
  readonly name: string;
  readonly at: string;
}

/**
 * An option's value read once — by its getter, where it has one — into a
 * copy of its data, which the checks read and a server holds in its place.
 *
 * @param owner - The options it is one of
 * @param key - Its name in them
 * @param code - The code a check refuses it with
 * @param name - What a refusal names it
 * @param at - What a refusal names it an option of: `accounts`, `accounts.me`
 * @returns The option, read
 * @example
 * ```ts
 * readOption(api.options, "forward", "FORWARD_OPTIONS_INVALID", "forward", "accounts").copy;
 * ```
 */
export function readOption(
  owner: object,
  key: string,
  code: ConfigurationErrorCode,
  name: string,
  at: string,
): ReadOption {
  const own = Reflect.getOwnPropertyDescriptor(owner, key);
  const value: unknown =
    own === undefined
      ? (Reflect.get(owner, key) as unknown)
      : "value" in own
        ? (own.value as unknown)
        : (own.get?.call(owner) as unknown);
  return { owner, key, own, copy: dataCopy(value), code, name, at };
}

/**
 * Keep each option as the check read it: its copy in its place, not to be
 * set anew, and one its options do not name held unset, so none is set
 * later. One no copy can take the place of — in options their user froze
 * — passes only where it is fixed already, data frozen to its depths. All
 * are judged before any is held.
 *
 * @param options - The options the check passed, read once each
 * @throws ConfigurationError with an option's code, where it can change and no copy can take its place
 * @example
 * ```ts
 * holdInPlace([readOption(api.options, "forward", "FORWARD_OPTIONS_INVALID", "forward", "accounts")]);
 * ```
 */
export function holdInPlace(options: readonly ReadOption[]): void {
  const placed = options.filter(placeable);
  for (const option of placed) place(option);
}

/* Whether a copy can take an option's place — a property its owner lets be defined anew, or one
   still writable, as options their user sealed have — or, where none can, whether it is fixed. */
function placeable(option: ReadOption): boolean {
  const { owner, own } = option;
  if (own === undefined ? Object.isExtensible(owner) : own.configurable || own.writable) {
    return true;
  }
  const fixedAlready = own === undefined ? option.copy === undefined : fixed(own, []);
  if (fixedAlready) return false;
  throw new ConfigurationError(
    option.code,
    `${option.at}: ${option.key} can change in options its user froze or sealed, where a server cannot put a copy in its place: freeze ${option.key} to its depths too, as data, or leave the options unfrozen`,
  );
}

function place({ owner, key, own, copy, code, at }: ReadOption): void {
  const descriptor = { value: copy, writable: false, configurable: false };
  if (Reflect.defineProperty(owner, key, { ...descriptor, enumerable: own?.enumerable ?? false })) {
    return;
  }
  throw new ConfigurationError(
    code,
    `${at}: ${key} could not be held as checked: its options refused the copy a server puts in its place`,
  );
}

/* A property that is data no one can change: no getter, and every object and list in its value
   frozen, theirs too. */
function fixed(own: PropertyDescriptor, within: readonly object[]): boolean {
  if (!("value" in own)) return false;
  const { value }: { value?: unknown } = own;
  if (typeof value === "function") return false;
  if (typeof value !== "object" || value === null) return true;
  if (within.includes(value) || !Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const inner = Reflect.getOwnPropertyDescriptor(value, key);
    return inner !== undefined && fixed(inner, [...within, value]);
  });
}
