/**
 * Curated dictionaries for realistic mock data generation.
 * Used by data-generator heuristics to produce natural-looking values.
 *
 * Public-facing barrel: each constant is explicitly re-exported from
 * the per-domain module so external imports stay unchanged.
 */

export { BRANDS, CATEGORIES, DESCRIPTIONS, REVIEWS, TAGS, TITLES } from "./commerce";
export { CITIES, COUNTRIES, STATES, STREETS } from "./locations";
export {
  COLOR_NAMES,
  CURRENCIES,
  LOCALES,
  PARAGRAPHS,
  PRIORITIES,
  ROLES,
  STATUSES,
} from "./misc";
export { FIRST_NAMES, LAST_NAMES, PERSON_NAMES } from "./people";
