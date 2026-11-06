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
  /* The docs pages' MDX, which the site reads from a folder its caller may name, so the tracing
     cannot follow the reads to it by itself. */
  outputFileTracingIncludes: { "/**": ["./src/content/docs/**/*.mdx"] },
  /* A shared build server renders a page's first batch slower than a
     developer's machine; a page that runs out of time fails the build. */
  staticPageGenerationTimeout: 180,
  serverExternalPackages: ["@noverax/courier"],
  /* Next.js otherwise writes its own guidance files into the project on
     every dev start; the site's tree holds only its own sources. */
  agentRules: false,
  async rewrites() {
    return {
      /* A docs page as Markdown at its own address, to a request the proxy marked as asking for
         it by its Accept; the header is the proxy's MARKDOWN_ASKED. */
      beforeFiles: [
        {
          source: "/docs/:path+",
          has: [{ type: "header", key: "x-docs-markdown", value: "1" }],
          destination: "/markdown/:path+",
        },
      ],
      /* A docs page as Markdown, at its own address with .md after it. */
      afterFiles: [{ source: "/docs/:path+.md", destination: "/markdown/:path+" }],
    }
  },
  /* A page that moved keeps its old address, so a link published to it still arrives; the
     docs' own address is the first page's, for good, so search engines index that page alone. */
  async redirects() {
    return [
      { source: "/docs", destination: "/docs/introduction", permanent: true },
      {
        source: "/docs/proxy-mode/boundary",
        destination: "/docs/proxy-mode/expose",
        permanent: true,
      },
    ]
  },
}

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug", "rehype-mdx-code-props"],
  },
})

export default withMDX(nextConfig)
