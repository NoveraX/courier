/*
 * The Porter2 algorithm — Snowball's English stemmer — for the words a
 * search reads: lowercased runs of letters and digits, which hold no
 * apostrophe. Its regions, steps and lists are the algorithm's own; a
 * letter other than a to z counts as no vowel.
 */

/* `y` is a vowel; `Y`, a `y` the algorithm marks as a consonant, is not. */
const VOWELS = "aeiouy";
const DOUBLES = new Set(["bb", "dd", "ff", "gg", "mm", "nn", "pp", "rr", "tt"]);
const LI_ENDINGS = "cdeghkmnrt";

/* Words written space apart. */
const listed = (text: string): string[] => text.split(" ");

/* Pairs written `suffix:replacement`, space apart. */
function pairs(text: string): readonly (readonly [string, string])[] {
  return listed(text).map((pair) => {
    const [from = "", to = ""] = pair.split(":");
    return [from, to] as const;
  });
}

/* The words with a stem of their own, and those left as they are. */
const EXCEPTIONS = new Map(
  pairs(
    "skis:ski skies:sky dying:die lying:lie tying:tie idly:idl gently:gentl ugly:ugli early:earli " +
      "only:onli singly:singl sky:sky news:news howe:howe atlas:atlas cosmos:cosmos bias:bias andes:andes",
  ),
);
/* The words step 1a leaves for good. */
const AFTER_1A = new Set(listed("inning outing canning herring earring proceed exceed succeed"));
/* The beginnings that end R1 where they end. */
const R1_PREFIXES = ["gener", "commun", "arsen"];
/* Each step's suffixes, longest first, each with what it becomes. */
const STEP_1B = ["eedly", "ingly", "edly", "eed", "ing", "ed"];
const STEP_2 = pairs(
  "ization:ize ational:ate fulness:ful ousness:ous iveness:ive tional:tion biliti:ble lessli:less " +
    "entli:ent ation:ate alism:al aliti:al ousli:ous iviti:ive fulli:ful enci:ence anci:ance " +
    "abli:able izer:ize ator:ate alli:al bli:ble ogi:og li:",
);
const STEP_3 = pairs(
  "ational:ate tional:tion alize:al icate:ic iciti:ic ative: ical:ic ness: ful:",
);
const STEP_4 = listed(
  "ement ance ence able ible ment ant ent ism ate iti ous ive ize ion al er ic",
);

const isVowel = (letter: string | undefined): boolean =>
  letter !== undefined && VOWELS.includes(letter);
const hasVowel = (text: string): boolean => [...text].some(isVowel);

/* Where the first consonant after a vowel ends, looking from `from`: where R1 starts, or R2. */
function regionAfter(word: string, from: number): number {
  for (let at = from + 1; at < word.length; at++) {
    if (isVowel(word[at - 1]) && !isVowel(word[at])) return at + 1;
  }
  return word.length;
}

/* Whether the word's first `end` letters end in a short syllable. */
function endsShort(word: string, end: number): boolean {
  if (end === 2) return isVowel(word[0]) && !isVowel(word[1]);
  const last = word[end - 1] ?? "";
  const consonantVowel = end > 2 && !isVowel(word[end - 3]) && isVowel(word[end - 2]);
  return consonantVowel && !isVowel(last) && !"wxY".includes(last);
}

function step1a(word: string): string {
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ied") || word.endsWith("ies")) {
    return word.slice(0, -3) + (word.length > 4 ? "i" : "ie");
  }
  if (word.endsWith("us") || word.endsWith("ss") || !word.endsWith("s")) return word;
  /* A vowel before the letter the `s` follows: `gaps` loses it, `gas` keeps it. */
  return hasVowel(word.slice(0, -2)) ? word.slice(0, -1) : word;
}

function step1b(word: string, r1: number): string {
  const suffix = STEP_1B.find((ending) => word.endsWith(ending));
  if (suffix === undefined) return word;
  const base = word.slice(0, -suffix.length);
  if (suffix.startsWith("ee")) return base.length >= r1 ? `${base}ee` : word;
  if (!hasVowel(base)) return word;
  if (base.endsWith("at") || base.endsWith("bl") || base.endsWith("iz")) return `${base}e`;
  if (DOUBLES.has(base.slice(-2))) return base.slice(0, -1);
  /* A short word — R1 empty, a short syllable at its end — takes an `e`: `hop` is `hope`. */
  return r1 >= base.length && endsShort(base, base.length) ? `${base}e` : base;
}

function step1c(word: string): string {
  const last = word.at(-1);
  const after = word.at(-2);
  return (last === "y" || last === "Y") && word.length > 2 && !isVowel(after)
    ? `${word.slice(0, -1)}i`
    : word;
}

/* Steps 2 and 3: the longest suffix, replaced when it is in R1 — `ative` in R2 — and its
   letter before allows it. */
function replaced(word: string, suffixes: typeof STEP_2, r1: number, r2: number): string {
  const found = suffixes.find(([suffix]) => word.endsWith(suffix));
  if (found === undefined) return word;
  const [suffix, by] = found;
  const at = word.length - suffix.length;
  const before = word[at - 1] ?? "";
  const allowed =
    at >= r1 &&
    (suffix !== "ative" || at >= r2) &&
    (suffix !== "ogi" || before === "l") &&
    (suffix !== "li" || LI_ENDINGS.includes(before));
  return allowed ? word.slice(0, at) + by : word;
}

function step4(word: string, r2: number): string {
  const suffix = STEP_4.find((ending) => word.endsWith(ending));
  if (suffix === undefined) return word;
  const at = word.length - suffix.length;
  const before = word[at - 1];
  const allowed = at >= r2 && (suffix !== "ion" || before === "s" || before === "t");
  return allowed ? word.slice(0, at) : word;
}

function step5(word: string, r1: number, r2: number): string {
  const at = word.length - 1;
  const endsInE = word.endsWith("e") && (at >= r2 || (at >= r1 && !endsShort(word, at)));
  return endsInE || (word.endsWith("ll") && at >= r2) ? word.slice(0, at) : word;
}

/**
 * The stem of an English word, as the Porter2 algorithm gives it: its
 * inflections and most of its derivations come to one stem — `map`,
 * `maps`, `mapped` and `mapping` to `map`, `validate` and `validation` to
 * `valid`. A stem need not be a word: `proxy` and `proxies` are `proxi`.
 *
 * @param word - A lowercased word of letters and digits
 * @returns Its stem
 * @example
 * ```ts
 * stemOf("mapping"); // "map"
 * ```
 */
export function stemOf(word: string): string {
  const exception = EXCEPTIONS.get(word);
  if (exception !== undefined) return exception;
  if (word.length <= 2) return word;
  /* A `y` the word begins with, or one after a vowel, is a consonant. */
  let marked = "";
  for (const letter of word) {
    marked += letter === "y" && (marked === "" || isVowel(marked.at(-1))) ? "Y" : letter;
  }
  const prefix = R1_PREFIXES.find((start) => marked.startsWith(start));
  const r1 = prefix?.length ?? regionAfter(marked, 0);
  const r2 = regionAfter(marked, r1);
  const afterStep1a = step1a(marked);
  if (AFTER_1A.has(afterStep1a)) return afterStep1a;
  let stem = step1c(step1b(afterStep1a, r1));
  stem = replaced(stem, STEP_2, r1, r2);
  stem = replaced(stem, STEP_3, r1, r2);
  stem = step5(step4(stem, r2), r1, r2);
  return stem.replaceAll("Y", "y");
}
