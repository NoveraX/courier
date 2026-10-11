import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from "node:crypto";

/** A certificate and the private key it was issued for, both PEM. */
export interface IssuedCertificate {
  cert: string;
  key: string;
}

/** A certificate authority of a test's own, and what it issued. */
export interface TestCertificates {
  /** The authority's certificate, PEM: what a client or a server trusts */
  ca: string;
  /** A server's, for the names given — `localhost` and `127.0.0.1` by default */
  server: IssuedCertificate;
  /** A client's, for mutual TLS */
  client: IssuedCertificate;
  /** Another client certificate the authority issues, under a name of its own: a renewed one, say */
  issueClient(name: string): IssuedCertificate;
}

interface Issuer {
  name: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

interface Subject {
  name: string;
  publicKey: KeyObject;
  ca?: boolean;
  names?: readonly string[];
  usage?: readonly string[];
}

const SERVER_AUTH = "1.3.6.1.5.5.7.3.1";
const CLIENT_AUTH = "1.3.6.1.5.5.7.3.2";
const ECDSA_SHA256 = "1.2.840.10045.4.3.2";

/**
 * A certificate authority made for one test, and a server and a client
 * certificate it signed — P-256 keys, valid from an hour ago for a day —
 * built with `node:crypto` alone, so no test needs `openssl` or a key
 * checked in.
 *
 * @param serverNames - The names and IPv4 addresses the server's certificate is for
 * @returns The authority's certificate and the two it issued
 * @example
 * ```ts
 * const { ca, server, client } = testCertificates();
 * createServer({ ...server, ca, requestCert: true, rejectUnauthorized: true });
 * ```
 */
export function testCertificates(
  serverNames: readonly string[] = ["localhost", "127.0.0.1"],
): TestCertificates {
  const authority: Issuer = { name: "Courier Test CA", ...keyPair() };
  const ca = issue({ ...authority, ca: true }, authority);
  return {
    ca,
    server: issuedFor(authority, {
      name: serverNames[0] ?? "localhost",
      names: serverNames,
      usage: [SERVER_AUTH],
    }),
    client: issuedFor(authority, { name: "courier-client", usage: [CLIENT_AUTH] }),
    issueClient: (name) => issuedFor(authority, { name, usage: [CLIENT_AUTH] }),
  };
}

function issuedFor(authority: Issuer, subject: Omit<Subject, "publicKey">): IssuedCertificate {
  const keys = keyPair();
  return {
    cert: issue({ ...subject, publicKey: keys.publicKey }, authority),
    key: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function keyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync("ec", { namedCurve: "P-256" });
}

function issue(subject: Subject, issuer: Issuer): string {
  const now = Date.now();
  const tbs = seq(
    tlv(0xa0, integer(Buffer.from([2]))),
    integer(randomBytes(16)),
    seq(oid(ECDSA_SHA256)),
    distinguishedName(issuer.name),
    seq(time(new Date(now - 3_600_000)), time(new Date(now + 86_400_000))),
    distinguishedName(subject.name),
    subject.publicKey.export({ type: "spki", format: "der" }),
    tlv(0xa3, seq(...extensionsOf(subject, issuer))),
  );
  const der = seq(tbs, seq(oid(ECDSA_SHA256)), bits(sign("sha256", tbs, issuer.privateKey)));
  const body =
    der
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function extensionsOf(subject: Subject, issuer: Issuer): Buffer[] {
  const { ca = false, names = [], usage = [] } = subject;
  return [
    extension("2.5.29.19", true, ca ? seq(tlv(0x01, Buffer.from([0xff]))) : seq()),
    /* keyCertSign and cRLSign for the authority, digitalSignature for the others */
    extension("2.5.29.15", true, ca ? bits(Buffer.from([0x86]), 1) : bits(Buffer.from([0x80]), 7)),
    extension("2.5.29.14", false, octets(keyId(subject.publicKey))),
    extension("2.5.29.35", false, seq(tlv(0x80, keyId(issuer.publicKey)))),
    ...(usage.length > 0 ? [extension("2.5.29.37", false, seq(...usage.map(oid)))] : []),
    ...(names.length > 0 ? [extension("2.5.29.17", false, seq(...names.map(altName)))] : []),
  ];
}

function altName(name: string): Buffer {
  return /^\d+\.\d+\.\d+\.\d+$/.test(name)
    ? tlv(0x87, Buffer.from(name.split(".").map(Number)))
    : tlv(0x82, Buffer.from(name));
}

function keyId(publicKey: KeyObject): Buffer {
  return createHash("sha1")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest();
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return seq(oid(id), ...(critical ? [tlv(0x01, Buffer.from([0xff]))] : []), octets(value));
}

function distinguishedName(commonName: string): Buffer {
  return seq(tlv(0x31, seq(oid("2.5.4.3"), tlv(0x0c, Buffer.from(commonName)))));
}

function time(date: Date): Buffer {
  const digits = date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return date.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(`${digits.slice(2)}Z`))
    : tlv(0x18, Buffer.from(`${digits}Z`));
}

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const encoded = [arc & 0x7f];
    for (let value = arc >> 7; value > 0; value >>= 7) encoded.unshift(0x80 | (value & 0x7f));
    bytes.push(...encoded);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function integer(bytes: Buffer): Buffer {
  let value = bytes;
  while (value.length > 1 && value[0] === 0 && ((value[1] ?? 0) & 0x80) === 0)
    value = value.subarray(1);
  return tlv(
    0x02,
    ((value[0] ?? 0) & 0x80) === 0 ? value : Buffer.concat([Buffer.from([0]), value]),
  );
}

function bits(bytes: Buffer, unused = 0): Buffer {
  return tlv(0x03, Buffer.from([unused]), bytes);
}

function octets(...parts: Buffer[]): Buffer {
  return tlv(0x04, ...parts);
}

function seq(...parts: Buffer[]): Buffer {
  return tlv(0x30, ...parts);
}

function tlv(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), lengthOf(body.length), body]);
}

function lengthOf(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
