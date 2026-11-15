/**
 * What a page receives of a value through the proxy, which sends it on as
 * JSON.
 */

/* A type nothing is read off: `any`, and `unknown`, which may be anything. */
type Opaque<T> = 0 extends 1 & T ? true : unknown extends T ? true : false;

/* What JSON leaves out of an object and writes as `null` in a list: it has no such value. */
type Unwritten = undefined | symbol | ((...args: never[]) => unknown);

/* What the proxy sends as itself, as the page reads it back: bytes as an ArrayBuffer, a Blob
   — a File too — as a Blob, a FormData as itself. */
type SentAsItself<T> = T extends ArrayBuffer | ArrayBufferView
  ? ArrayBuffer
  : T extends Blob
    ? Blob
    : FormData;

/**
 * A value as a page receives it through the proxy: the value itself where
 * JSON keeps it whole, and otherwise what `JSON.parse(JSON.stringify(value))`
 * reads — a value's `toJSON` asked first, so a `Date` is its ISO string; a
 * `Set` or a `Map` an empty object; a function or a symbol gone from its
 * object, `null` in a list; `undefined` on its own `null`; a `bigint`,
 * which JSON does not write, nothing. Bytes, a `Blob` and a `FormData` the
 * proxy sends as themselves: bytes reach the page as an `ArrayBuffer`, a
 * `File` as a `Blob`.
 *
 * @example
 * ```ts
 * type Row = Proxied<{ id: string; at: Date; tags: Set<string> }>;
 * // { id: string; at: string; tags: Record<string, never> }
 * type User = Proxied<{ id: string; name: string }>; // { id: string; name: string }
 * type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
 * type Settings = Proxied<Json>; // Json
 * ```
 */
export type Proxied<T> =
  Opaque<T> extends true
    ? T
    : T extends ArrayBuffer | ArrayBufferView | Blob | FormData
      ? SentAsItself<T>
      : T extends Unwritten
        ? null
        : T extends void
          ? T
          : KeptWhole<T, Written<T>>;

/* The value's own type where JSON gives back a value of it, and what JSON gives back otherwise. */
type KeptWhole<T, TWritten> = [TWritten] extends [T]
  ? [T] extends [TWritten]
    ? T
    : TWritten
  : TWritten;

/* What JSON writes of a value: what its `toJSON` answers, when it has one, and then the rest. */
type Written<T> =
  Opaque<T> extends true
    ? T
    : T extends { toJSON(...args: never[]): infer TJson }
      ? WrittenAs<TJson>
      : WrittenAs<T>;

type WrittenAs<T> =
  Opaque<T> extends true
    ? T
    : T extends Unwritten
      ? undefined
      : T extends string | number | boolean | null
        ? T
        : T extends bigint
          ? never
          : T extends ReadonlySet<unknown> | ReadonlyMap<unknown, unknown>
            ? Record<string, never>
            : T extends readonly unknown[]
              ? WrittenList<T>
              : {
                  [K in keyof T as K extends symbol
                    ? never
                    : [T[K]] extends [Unwritten]
                      ? never
                      : K]: OptionalProperty<T, K> extends true
                    ? /* Left out when it holds nothing, so it holds a value where it is there. */
                      Written<Exclude<T[K], undefined>>
                    : Written<T[K]>;
                };

/* A list as JSON writes it: one of any length as an array type, a tuple item by item. The
   checker works an array type's items out once they are read, and a mapped type's as it is
   made, which for a list of a recursive type — JSON's own value among them — never ends. */
type WrittenList<T extends readonly unknown[]> = T[number][] extends T
  ? T extends unknown[]
    ? InList<Written<T[number]>>[]
    : readonly InList<Written<T[number]>>[]
  : { [K in keyof T]: InList<Written<T[K]>> };

/* An item of a list as JSON writes it: one it has no value for is `null`. */
type InList<T> = T extends undefined ? null : T;

/* Whether a key names one optional property, rather than the keys of an index signature, any
   of which may hold nothing. */
type OptionalProperty<T, K extends keyof T> =
  {} extends Record<K, unknown> ? false : {} extends Pick<T, K> ? true : false;
