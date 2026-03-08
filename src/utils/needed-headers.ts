const neededHeaders = [
  "referer",
  "origin",
  "authorization",
  "user-agent",
  "cookie",
  "set-cookie",
  "forwarded-for",
  "forwarded",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-forwarded-for",
  "x-forwarded",
  "x-real-ip",
  "x-request-id",
] as const;

export default neededHeaders;
