import type { RawBody } from "../utils/body-kind";

type Lower =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Letter = Lower | Uppercase<Lower>;
type NameStart = Letter | "_";
type NameChar = NameStart | Digit;
type SchemeChar = Letter | Digit | "+" | "-" | ".";

type TakeName<
  TRest extends string,
  TName extends string = "",
> = TRest extends `${infer C}${infer TTail}`
  ? C extends NameChar
    ? TakeName<TTail, `${TName}${C}`>
    : TName
  : TName;

type NameAt<TRest extends string> = TRest extends `${infer C}${string}`
  ? C extends NameStart
    ? TakeName<TRest>
    : never
  : never;

type SchemeRest<TRest extends string> = TRest extends `${infer C}${infer TTail}`
  ? C extends SchemeChar
    ? SchemeRest<TTail>
    : false
  : true;

type IsScheme<TScheme extends string> = TScheme extends `${infer C}${infer TTail}`
  ? C extends Letter
    ? SchemeRest<TTail>
    : false
  : false;

/* A path up to its query or fragment, which hold no parameter. */
type BeforeQuery<TPath extends string> = TPath extends `${infer THead}?${string}`
  ? BeforeFragment<THead>
  : BeforeFragment<TPath>;

type BeforeFragment<TPath extends string> = TPath extends `${infer THead}#${string}`
  ? THead
  : TPath;

/* The part of a path its parameters are read from: an absolute URL's scheme and host hold none. */
type LocalPart<TPath extends string> = TPath extends `${infer TScheme}://${infer TAfter}`
  ? IsScheme<TScheme> extends true
    ? TAfter extends `${string}/${infer TLocal}`
      ? TLocal
      : ""
    : TPath
  : TPath;

/* `::` is one colon sent as written; any other colon starts a parameter when a name follows it. */
type NamesIn<TPath extends string> = TPath extends `${string}:${infer TRest}`
  ? TRest extends `:${infer TAfter}`
    ? NamesIn<TAfter>
    : NameAt<TRest> | NamesIn<TRest>
  : never;

type AllNameChars<TRest extends string> = TRest extends `${infer C}${infer TTail}`
  ? C extends NameChar
    ? AllNameChars<TTail>
    : false
  : true;

type WholeName<TName extends string> = TName extends `${infer C}${infer TTail}`
  ? C extends NameStart
    ? AllNameChars<TTail> extends true
      ? TName
      : never
    : never
  : never;

/* What a pair of braces holds, when it is a name: `{id}`, or `{+name}` for a value with slashes. */
type BracedName<TInner extends string> = TInner extends `+${infer TName}`
  ? WholeName<TName>
  : WholeName<TInner>;

/* A brace starts a parameter when a name, `+` before it or not, runs to the closing brace. */
type BracedIn<TPath extends string> = TPath extends `${string}{${infer TRest}`
  ? TRest extends `${infer TInner}}${infer TAfter}`
    ? [BracedName<TInner>] extends [never]
      ? BracedIn<TRest>
      : BracedName<TInner> | BracedIn<TAfter>
    : never
  : never;

/**
 * The names of a path's parameters, read as the request is built: `:name`,
 * a letter or `_` then letters, digits and `_`; `{name}`, the same name with
 * its end written; and `{+name}`, whose value keeps its slashes. `::` is one
 * colon the path sends as written, and neither an absolute URL's scheme and
 * host nor a query or fragment the path writes holds a parameter. A path
 * known only as `string` names none.
 *
 * @example
 * ```ts
 * type Names = PathParamNames<"orgs/:orgId/users/:id.json">; // "orgId" | "id"
 * type Google = PathParamNames<"v1/{+name}::cancel">; // "name"
 * type Suffixed = PathParamNames<"files/{id}abc">; // "id"
 * type Query = PathParamNames<"users/:id?expand=:what">; // "id"
 * ```
 */
export type PathParamNames<TPath extends string> = string extends TPath
  ? never
  : NamesIn<LocalPart<BeforeQuery<TPath>>> | BracedIn<LocalPart<BeforeQuery<TPath>>>;

/** What a type error names when variables leave out a path's parameters. */
export interface PathParamsMissing<TNames extends string> {
  readonly "declare each path parameter in the variables": TNames;
}

/* Variables that are not a record of fields — a list, a scalar, a raw body —
   fill no parameter by name, and a form fills them by names its type does
   not know: the path takes its parameters from them or from pathOptions,
   unchecked. So do variables typed unknown. */
type NotFields = RawBody | FormData | readonly unknown[] | string | number | boolean | bigint;

type MissingFrom<TNames extends string, TVariables> = unknown extends TVariables
  ? never
  : [NonNullable<TVariables>] extends [NotFields]
    ? never
    : Exclude<TNames, keyof NonNullable<TVariables>>;

// biome-ignore lint/suspicious/noConfusingVoidType: the builder marks variables not declared yet with `void`
type Undeclared<TVariables> = [TVariables] extends [void] ? true : false;

/**
 * The variables of an endpoint once its path is known: those declared, or —
 * when none were — each of the path's parameters, required.
 */
export type VariablesForPath<TVariables, TPath extends string> =
  Undeclared<TVariables> extends true
    ? [PathParamNames<TPath>] extends [never]
      ? TVariables
      : { [TName in PathParamNames<TPath>]: string | number }
    : TVariables;

/** What a type error names when a path writes a fragment, which never reaches the server. */
export interface PathFragmentRefused {
  readonly "a request sends its path up to the #: write %23 for a # the path sends": true;
}

type HasFragment<TPath extends string> = string extends TPath
  ? false
  : TPath extends `${string}#${string}`
    ? true
    : false;

/**
 * A path, as the builder takes it: one that writes a fragment is refused
 * where it is written, and so, after variables were declared, is one whose
 * parameters the variables do not all name.
 */
export type CheckedPath<TPath extends string, TVariables> =
  HasFragment<TPath> extends true
    ? TPath & PathFragmentRefused
    : Undeclared<TVariables> extends true
      ? TPath
      : [MissingFrom<PathParamNames<TPath>, TVariables>] extends [never]
        ? TPath
        : TPath & PathParamsMissing<MissingFrom<PathParamNames<TPath>, TVariables>>;

/**
 * The arguments of `.variables()` after the path: the schema, when the
 * variables name every parameter of the path, and otherwise one argument no
 * schema fits, whose type names the parameters left out — so the call is
 * refused where it is written.
 */
export type WithPathParams<TNames extends string, TVariables, TArgs extends unknown[]> = [
  MissingFrom<TNames, TVariables>,
] extends [never]
  ? TArgs
  : [missing: PathParamsMissing<MissingFrom<TNames, TVariables>>];
