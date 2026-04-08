/**
 * People-related dictionaries: first/last/full names used by the
 * data generator when filling person-shaped fields.
 */

export const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Edward",
  "Fiona",
  "George",
  "Hannah",
  "Ivan",
  "Julia",
  "Kevin",
  "Laura",
  "Michael",
  "Nina",
  "Oscar",
  "Patricia",
  "Quinn",
  "Rachel",
  "Samuel",
  "Teresa",
  "Victor",
  "Wendy",
  "Xavier",
  "Yara",
  "Zachary",
];

export const LAST_NAMES = [
  "Anderson",
  "Brown",
  "Clark",
  "Davis",
  "Evans",
  "Fisher",
  "Garcia",
  "Harris",
  "Ibrahim",
  "Johnson",
  "Kim",
  "Lee",
  "Martinez",
  "Nguyen",
  "O'Brien",
  "Patel",
  "Quinn",
  "Robinson",
  "Smith",
  "Taylor",
  "Ueda",
  "Volkov",
  "Williams",
  "Xu",
  "Yamamoto",
];

export const PERSON_NAMES = FIRST_NAMES.map((f, i) => `${f} ${LAST_NAMES[i]}`);
