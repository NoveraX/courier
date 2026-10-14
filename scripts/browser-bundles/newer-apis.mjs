/**
 * The browser APIs a page cannot count on: newer than the browsers the
 * requirements name — Safari 15.4, Chrome 97, Firefox 104 — or missing
 * where a page is served over plain HTTP. Each says how a call of it is
 * found, the name a check for it uses, and the last versions without it.
 */
export const NEWER_APIS = [
  {
    name: "URL.canParse",
    find: /\bURL\.canParse\b/,
    guard: "canParse",
    lacking: "Safari 16, Chrome 119 and Firefox 114",
  },
  {
    name: "URL.parse",
    find: /\bURL\.parse\(/,
    guard: "parse",
    lacking: "Safari 17, Chrome 125 and Firefox 125",
  },
  {
    name: "Promise.withResolvers",
    find: /\bPromise\.withResolvers\b/,
    guard: "withResolvers",
    lacking: "Safari 17.3, Chrome 118 and Firefox 120",
  },
  {
    name: "Object.groupBy",
    find: /\b(?:Object|Map)\.groupBy\b/,
    guard: "groupBy",
    lacking: "Safari 17.3, Chrome 116 and Firefox 118",
  },
  {
    name: "toSorted, toReversed or toSpliced",
    find: /\.(?:toSorted|toReversed|toSpliced)\(/,
    guard: "toSorted|toReversed|toSpliced",
    lacking: "Safari 15.6, Chrome 109 and Firefox 114",
  },
  {
    name: "a Set method of ES2025",
    find: /\.(?:union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/,
    guard: "union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom",
    lacking: "Safari 16, Chrome 121 and Firefox 126",
  },
  {
    name: "Array.fromAsync",
    find: /\bArray\.fromAsync\b/,
    guard: "fromAsync",
    lacking: "Safari 16.3, Chrome 120 and Firefox 114",
  },
  {
    name: "AbortSignal.any",
    find: /\bAbortSignal\.any\b/,
    guard: "any",
    lacking: "Safari 17.3, Chrome 115 and Firefox 123",
  },
  {
    name: "AbortSignal.timeout",
    find: /\bAbortSignal\.timeout\b/,
    guard: "timeout",
    lacking: "Safari 15.6, Chrome 102, Firefox 99 and React Native",
  },
  {
    name: "AbortSignal.throwIfAborted",
    find: /\.throwIfAborted\(/,
    guard: "throwIfAborted",
    lacking: "Chrome 99",
  },
  {
    name: "structuredClone",
    find: /\bstructuredClone\(/,
    guard: "structuredClone",
    lacking: "Chrome 97 and React Native",
  },
  {
    name: "crypto.randomUUID",
    find: /\.randomUUID\(/,
    guard: "randomUUID",
    lacking: "a page over plain HTTP and React Native",
  },
  {
    name: "crypto.subtle",
    find: /\.subtle\b/,
    guard: "subtle",
    lacking: "a page over plain HTTP and React Native",
  },
  {
    name: "Headers.getSetCookie",
    find: /\.getSetCookie\(/,
    guard: "getSetCookie",
    lacking: "Safari 16, Chrome 112, Firefox 111 and React Native",
  },
  {
    name: "Response.json",
    find: /\bResponse\.json\(/,
    guard: "json",
    lacking: "Safari 16, Chrome 104 and Firefox 114",
  },
  {
    name: "ReadableStream.from",
    find: /\bReadableStream\.from\(/,
    guard: "from",
    lacking: "Safari and Chrome 120",
  },
  {
    name: "Intl.Segmenter",
    find: /\bIntl\.Segmenter\b/,
    guard: "Segmenter",
    lacking: "Firefox 124",
  },
  {
    name: "requestIdleCallback",
    find: /\brequestIdleCallback\(/,
    guard: "requestIdleCallback",
    lacking: "Safari",
  },
  {
    name: "CompressionStream",
    find: /\b(?:Compression|Decompression)Stream\b/,
    guard: "CompressionStream|DecompressionStream",
    lacking: "Safari 16.3 and Firefox 112",
  },
  {
    name: "TextDecoderStream",
    find: /\bTextDecoderStream\b/,
    guard: "TextDecoderStream",
    lacking: "Firefox 104",
  },
];
