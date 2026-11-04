import { invalidField, Refusal } from "./refusal"

/** The roles a user can have. */
export const ROLES = ["admin", "user", "moderator"] as const
export type Role = (typeof ROLES)[number]

const CONTROL = /\p{Cc}/u
/* Something, an @, a domain with a dot: the shape of an address, read only after its length is. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/* A whole number as a path or a query writes one: digits alone, no sign, no leading zero. */
const DIGITS = /^(?:0|[1-9]\d{0,15})$/

/**
 * A call's JSON body as its fields.
 *
 * @param body - The body as the parser read it
 * @returns Its fields
 * @throws Refusal `INVALID_BODY` for a body that is not a JSON object
 * @example
 * ```ts
 * const fields = fieldsOf(req.body)
 * ```
 */
export function fieldsOf(body: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(body)) throw new Refusal(400, "INVALID_BODY", "The body is a JSON object of fields")
  return body
}

/**
 * Whether a value is an object of named values: not `null`, not an array.
 *
 * @param value - The value
 * @returns `true` for an object of named values
 * @example
 * ```ts
 * isRecord({ name: "Jane" }) // true
 * ```
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A field of text: present, of 1 to `max` characters once trimmed, with no
 * control characters.
 *
 * @param value - The field's value
 * @param field - Its name, for the refusal
 * @param max - The most characters it may hold
 * @returns The text, trimmed
 * @throws Refusal `INVALID_FIELD`
 * @example
 * ```ts
 * text(fields.name, "name", 80) // "Jane Doe"
 * ```
 */
export function text(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (trimmed === "" || trimmed.length > max || CONTROL.test(trimmed)) {
    throw invalidField(field, `text of 1 to ${max} characters`)
  }
  return trimmed
}

/**
 * An e-mail address of at most `max` characters.
 *
 * @param value - The field's value
 * @param max - The most characters it may hold
 * @returns The address, trimmed
 * @throws Refusal `INVALID_FIELD`
 * @example
 * ```ts
 * email(fields.email, 254) // "jane@example.com"
 * ```
 */
export function email(value: unknown, max: number): string {
  const address = text(value, "email", max)
  if (!EMAIL.test(address)) throw invalidField("email", "an e-mail address")
  return address
}

/**
 * A user's role.
 *
 * @param value - The field's value
 * @returns The role
 * @throws Refusal `INVALID_FIELD` for any other value
 * @example
 * ```ts
 * role(fields.role) // "moderator"
 * ```
 */
export function role(value: unknown): Role {
  const found = ROLES.find((name) => name === value)
  if (found === undefined) throw invalidField("role", "admin, user or moderator")
  return found
}

/**
 * A whole number from `min` to `max`, written in JSON or as a path or a
 * query writes one.
 *
 * @param value - The field's value
 * @param field - Its name, for the refusal
 * @param range - The smallest and the largest it may be
 * @returns The number
 * @throws Refusal `INVALID_FIELD`
 * @example
 * ```ts
 * wholeNumber(req.params.id, "id", { min: 1, max: Number.MAX_SAFE_INTEGER }) // 7
 * ```
 */
export function wholeNumber(
  value: unknown,
  field: string,
  { min, max }: { min: number; max: number }
): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && DIGITS.test(value)
        ? Number(value)
        : Number.NaN
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw invalidField(field, `a whole number from ${min} to ${max}`)
  }
  return number
}
