import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
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
