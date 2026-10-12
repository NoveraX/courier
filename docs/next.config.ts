import path from "node:path"

import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  /* The server the site's image runs: the pages and only the files they
     need, Courier's packages among them, which the site takes from the
     repository rather than from npm. */
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["@noverax/courier"],
  /* Next.js otherwise writes its own guidance files into the project on
     every dev start; the site's tree holds only its own sources. */
  agentRules: false,
}

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug", "rehype-mdx-code-props"],
  },
})

export default withMDX(nextConfig)
