/** The eight 32-bit words a digest is built in. */
type State = [number, number, number, number, number, number, number, number];

/* The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4). */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/* The first 32 bits of the fractional parts of the square roots of the first eight primes. */
const INITIAL: State = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const rotr = (word: number, by: number): number => (word >>> by) | (word << (32 - by));

/* The message in whole 64-byte blocks: a 1 bit, zeros, then its length in bits as 64 bits. */
function padded(bytes: Uint8Array): DataView {
  const view = new DataView(new ArrayBuffer(Math.ceil((bytes.length + 9) / 64) * 64));
  new Uint8Array(view.buffer).set(bytes);
  view.setUint8(bytes.length, 0x80);
  view.setUint32(view.byteLength - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(view.byteLength - 4, (bytes.length * 8) >>> 0);
  return view;
}

/* The 64 words one block of the message expands to. */
function schedule(message: DataView, offset: number): DataView {
  const words = new DataView(new ArrayBuffer(256));
  for (let i = 0; i < 16; i++) words.setUint32(i * 4, message.getUint32(offset + i * 4));
  for (let i = 16; i < 64; i++) {
    const early = words.getUint32((i - 15) * 4);
    const late = words.getUint32((i - 2) * 4);
    const s0 = rotr(early, 7) ^ rotr(early, 18) ^ (early >>> 3);
    const s1 = rotr(late, 17) ^ rotr(late, 19) ^ (late >>> 10);
    words.setUint32(i * 4, words.getUint32((i - 16) * 4) + s0 + words.getUint32((i - 7) * 4) + s1);
  }
  return words;
}

/* The state after one block's 64 rounds. */
function compress(state: State, words: DataView): State {
  let [a, b, c, d, e, f, g, h] = state;
  for (const [i, k] of K.entries()) {
    const t1 = h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k;
    const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
    const sum = (t1 + words.getUint32(i * 4)) >>> 0;
    [h, g, f, e, d, c, b, a] = [g, f, e, (d + sum) >>> 0, c, b, a, (sum + t2) >>> 0];
  }
  const [s0, s1, s2, s3, s4, s5, s6, s7] = state;
  return [
    (s0 + a) >>> 0,
    (s1 + b) >>> 0,
    (s2 + c) >>> 0,
    (s3 + d) >>> 0,
    (s4 + e) >>> 0,
    (s5 + f) >>> 0,
    (s6 + g) >>> 0,
    (s7 + h) >>> 0,
  ];
}

/**
 * The SHA-256 digest of some bytes, computed in JavaScript, for a runtime
 * without `crypto.subtle`: React Native, and a page served over plain HTTP,
 * which browsers give none.
 *
 * @param bytes - What to digest
 * @returns The 32-byte digest
 * @example
 * ```ts
 * sha256(new TextEncoder().encode("abc")); // ba 78 16 bf … 15 ad
 * ```
 */
export function sha256(bytes: Uint8Array): Uint8Array {
  const message = padded(bytes);
  let state: State = [...INITIAL];
  for (let offset = 0; offset < message.byteLength; offset += 64) {
    state = compress(state, schedule(message, offset));
  }
  const digest = new DataView(new ArrayBuffer(32));
  for (const [i, word] of state.entries()) digest.setUint32(i * 4, word);
  return new Uint8Array(digest.buffer);
}
