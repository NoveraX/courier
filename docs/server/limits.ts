/**
 * Every limit the examples' backend keeps, in one place. The site's proxy
 * route takes its body limits from here too, so what a page may send is
 * the same on both hops.
 */
export interface DemoLimits {
  /** Characters in a user's name. */
  readonly nameLength: number
  /** Characters in an e-mail address: as many as SMTP carries. */
  readonly emailLength: number
  /** Characters in a post's title. */
  readonly titleLength: number
  /** Characters in a post's text. */
  readonly bodyLength: number
  /** Tags on a post, and characters in each. */
  readonly tags: number
  readonly tagLength: number
  /** Characters in a search for users. */
  readonly searchLength: number
  /** Users one page of the list holds at most, and the last page it reaches. */
  readonly pageSize: number
  readonly lastPage: number
  /** Bytes of a JSON or form body, and fields in a form. */
  readonly bodyBytes: number
  readonly formFields: number
  /** Bytes of an upload's file, its fields besides it, and bytes in each field. */
  readonly uploadBytes: number
  readonly uploadFields: number
  readonly uploadFieldBytes: number
}

/** The limits the examples' backend runs with. */
export const DEMO_LIMITS: DemoLimits = {
  nameLength: 80,
  emailLength: 254,
  titleLength: 120,
  bodyLength: 500,
  tags: 5,
  tagLength: 24,
  searchLength: 100,
  pageSize: 50,
  lastPage: 1000,
  bodyBytes: 16 * 1024,
  formFields: 100,
  uploadBytes: 1024 * 1024,
  uploadFields: 10,
  uploadFieldBytes: 1024,
}
