/**
 * Preloaded into a command a test runs, to hold it to no network: a
 * socket's connect — which every client over TCP or TLS goes through,
 * fetch's among them — and a name's lookup fail, each saying so on stderr
 * for the test to find.
 */
import dns from "node:dns";
import net from "node:net";

function refuse(what) {
  process.stderr.write(`network refused: ${what}\n`);
  throw new Error(`network refused: ${what}`);
}

net.Socket.prototype.connect = () => refuse("connect");
dns.lookup = () => refuse("dns.lookup");
dns.promises.lookup = async () => refuse("dns.promises.lookup");
