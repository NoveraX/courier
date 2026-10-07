import type { Config } from "@react-router/dev/config";

/* React Router 7 runs route middleware once it is asked to. */
export default { ssr: true, future: { v8_middleware: true } } satisfies Config;
