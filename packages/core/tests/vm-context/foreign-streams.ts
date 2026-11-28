/**
 * The global classes of web streams made another implementation's before a
 * test file runs, as jest-expo makes them: it loads the polyfill Metro puts
 * in a React Native app, web-streams-polyfill, which sets each class on the
 * global. `fetch`, `Response` and the bodies they make stay Node's.
 */
import {
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableByteStreamController,
  ReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest,
  ReadableStreamDefaultController,
  ReadableStreamDefaultReader,
  TransformStream,
  TransformStreamDefaultController,
  WritableStream,
  WritableStreamDefaultController,
  WritableStreamDefaultWriter,
} from "web-streams-polyfill/ponyfill";

const CLASSES = {
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableByteStreamController,
  ReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest,
  ReadableStreamDefaultController,
  ReadableStreamDefaultReader,
  TransformStream,
  TransformStreamDefaultController,
  WritableStream,
  WritableStreamDefaultController,
  WritableStreamDefaultWriter,
};

for (const [name, value] of Object.entries(CLASSES)) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}
