import type { EntityContext } from "./data-generator";
import {
  BRANDS,
  CATEGORIES,
  CITIES,
  COLOR_NAMES,
  COUNTRIES,
  CURRENCIES,
  DESCRIPTIONS,
  FIRST_NAMES,
  LAST_NAMES,
  LOCALES,
  PARAGRAPHS,
  PERSON_NAMES,
  PRIORITIES,
  REVIEWS,
  ROLES,
  STATES,
  STATUSES,
  STREETS,
  TAGS,
  TITLES,
} from "./dictionaries";
import { deterministicHex, formatKeyAsLabel, pick, pseudoRandom } from "./gen-helpers";

/** Generate a realistic string value based on field name heuristics */
export function generateString(
  key: string,
  index: number,
  context: EntityContext = "generic",
): string {
  const lower = key.toLowerCase();

  // Identity
  if (lower === "id" || lower === "uuid") return `id-${index}`;

  // "name" depends on entity context
  if (lower === "name" || lower === "fullname" || lower === "displayname") {
    if (context === "product") return pick(TITLES, index, `Product ${index}`);
    return pick(PERSON_NAMES, index, `Person ${index}`);
  }
  if (lower === "firstname" || lower === "first_name")
    return pick(FIRST_NAMES, index, `First${index}`);
  if (lower === "lastname" || lower === "last_name" || lower === "surname")
    return pick(LAST_NAMES, index, `Last${index}`);
  if (lower === "username") return `user_${pick(FIRST_NAMES, index, "user").toLowerCase()}${index}`;
  if (lower === "email") {
    const first = pick(FIRST_NAMES, index, "user").toLowerCase();
    const last = pick(LAST_NAMES, index, "doe").toLowerCase();
    return `${first}.${last}${index}@example.com`;
  }

  // Product / item
  if (lower === "title" || lower === "subject") return pick(TITLES, index, `Title ${index}`);
  if (lower.includes("description") || lower === "summary" || lower === "bio") {
    return pick(DESCRIPTIONS, index, `Description for item ${index}`);
  }
  if (lower === "sku" || lower === "code") return `SKU-${String(index).padStart(5, "0")}`;
  if (lower === "slug") return `item-${index}`;
  if (lower === "brand") return pick(BRANDS, index, `Brand ${index}`);
  if (lower === "label" || lower === "tag") return pick(TAGS, index, `tag-${index}`);

  // Contact
  if (lower.includes("phone") || lower.includes("tel")) {
    return `+1 (555) ${String(100 + index).padStart(3, "0")}-${String(1000 + index).slice(1)}`;
  }

  // Location
  if (lower.includes("address") || lower === "street")
    return `${100 + index} ${pick(STREETS, index, "Main St")}`;
  if (lower === "city") return pick(CITIES, index, "New York");
  if (lower === "state" || lower === "region") return pick(STATES, index, "CA");
  if (lower === "country") return pick(COUNTRIES, index, "United States");
  if (lower === "zip" || lower === "zipcode" || lower === "postalcode" || lower === "postal_code") {
    return String(10000 + index);
  }

  // Web
  if (lower.includes("url") || lower.includes("link") || lower === "href" || lower === "website") {
    return `https://example.com/${lower.replace("url", "").replace("link", "").trim() || "page"}/${index}`;
  }
  if (
    lower.includes("image") ||
    lower.includes("avatar") ||
    lower.includes("photo") ||
    lower.includes("thumbnail")
  ) {
    return `https://picsum.photos/seed/${index}/400/300`;
  }
  if (lower === "icon" || lower === "logo") return `https://picsum.photos/seed/${index}/64/64`;
  if (lower === "ip" || lower === "ipaddress")
    return `192.168.${Math.floor(index / 256)}.${index % 256}`;

  // Content
  if (lower === "comment" || lower === "review" || lower === "feedback")
    return pick(REVIEWS, index, `Comment ${index}`);
  if (lower === "body" || lower === "content" || lower === "text" || lower === "message") {
    return pick(PARAGRAPHS, index, `Content block ${index}`);
  }
  if (lower === "note" || lower === "notes") return `Note: ${pick(DESCRIPTIONS, index, "")}`;

  // Categorization
  if (lower === "category" || lower === "type" || lower === "group")
    return pick(CATEGORIES, index, "general");
  if (lower === "status") return pick(STATUSES, index, "active");
  if (lower === "priority") return pick(PRIORITIES, index, "medium");
  if (lower === "role") return pick(ROLES, index, "user");
  if (lower === "color" || lower === "colour") return pick(COLOR_NAMES, index, "blue");
  if (lower === "currency") return pick(CURRENCIES, index, "USD");
  if (lower === "locale" || lower === "language" || lower === "lang")
    return pick(LOCALES, index, "en");

  // Temporal
  if (lower.includes("date") || lower.endsWith("_at") || lower.endsWith("at")) {
    return generateDateString(index);
  }

  // Tokens
  if (lower === "token" || lower === "secret" || lower === "apikey" || lower === "api_key") {
    return `tok_${deterministicHex(index, 32)}`;
  }
  if (lower === "password" || lower === "hash") return `$2b$10$${deterministicHex(index, 22)}`;

  return `${formatKeyAsLabel(key)} ${index}`;
}

/** Generate ISO date string spread across a year */
export function generateDateString(index: number): string {
  const base = new Date("2025-01-01T00:00:00Z").getTime();
  const dayOffset = Math.floor(pseudoRandom(index) * 365) * 86_400_000;
  const hourOffset = Math.floor(pseudoRandom(index + 100) * 24) * 3_600_000;
  const minOffset = Math.floor(pseudoRandom(index + 200) * 60) * 60_000;
  return new Date(base + dayOffset + hourOffset + minOffset).toISOString();
}
