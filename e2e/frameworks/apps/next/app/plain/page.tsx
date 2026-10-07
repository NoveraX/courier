import { Suspense } from "react";

import { Me } from "../me";

/* No route config: reading the session is what makes the page render per request. */
export default function Plain() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Me id="plain" />
    </Suspense>
  );
}
