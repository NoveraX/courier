import { createWholeHolder, isWholeForget, isWholeSearchAsk } from "./whole-search-holder";

/* A worker of its own: a whole body runs to tens of megabytes, and parsing
   and searching it on the page would hold the page still meanwhile. */
const holder = createWholeHolder();

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isWholeSearchAsk(event.data)) globalThis.postMessage(holder.answer(event.data));
  else if (isWholeForget(event.data)) holder.forget(event.data.forget);
});
