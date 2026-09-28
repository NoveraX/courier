/**
 * Where the standard library's declarations hand the sources an `any`, these
 * narrow it to `unknown`. Only the repository's type check reads this file:
 * nothing in it is published, and no package's declarations depend on it.
 */

interface ArrayConstructor {
  /**
   * A value checked only to be an array holds elements nothing has checked.
   * The library types them `any`, which let an element's fields be read
   * without a check.
   */
  isArray(arg: unknown): arg is unknown[];
}
