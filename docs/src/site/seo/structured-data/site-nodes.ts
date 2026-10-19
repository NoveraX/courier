import { ORGANIZATION, REPOSITORY_URL, SITE_NAME } from "@/site/seo/site-identity"
import { SITE_PAGES } from "@/site/seo/site-pages"
import { absoluteUrl, type JsonLdNode, nodeId, reference } from "./json-ld-node"

const TYPESCRIPT = {
  "@type": "ComputerLanguage",
  name: "TypeScript",
  url: "https://www.typescriptlang.org",
}
const MIT = "https://opensource.org/licenses/MIT"

/**
 * Who publishes Courier, with its logo and its pages elsewhere.
 *
 * @returns The node
 * @example
 * ```ts
 * organizationNode().name // "NoveraX"
 * ```
 */
export function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": nodeId("/", "organization"),
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    logo: { "@type": "ImageObject", url: ORGANIZATION.logo, width: 512, height: 512 },
    sameAs: [...ORGANIZATION.sameAs],
  }
}

/**
 * The site itself: its name in search results, what it covers, and who
 * publishes it.
 *
 * @returns The node
 * @example
 * ```ts
 * websiteNode().url // "https://courier.noverax.cloud/"
 * ```
 */
export function websiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": nodeId("/", "website"),
    url: absoluteUrl("/"),
    name: SITE_NAME,
    description: SITE_PAGES.home.description,
    inLanguage: "en",
    publisher: reference(organizationNode()),
  }
}

/** A package of Courier's, as structured data names it. */
export interface PackageFacts {
  /** The page that is about it, which names its node. */
  path: string
  name: string
  packageName: string
  description: string
  /** Where its source is, from the repository's root. */
  directory: string
  /** The runtimes it runs on, when it says. */
  runtimes?: readonly string[] | undefined
  version?: string | undefined
}

/**
 * A package of Courier's as source code: its name and the one npm knows,
 * where its source is, the language it is written in, its licence and
 * who publishes it.
 *
 * @param facts - The package
 * @returns The node
 * @example
 * ```ts
 * softwareNode(COURIER_PACKAGE)["@type"] // "SoftwareSourceCode"
 * ```
 */
export function softwareNode(facts: PackageFacts): JsonLdNode {
  return {
    "@type": "SoftwareSourceCode",
    "@id": nodeId(facts.path, "software"),
    name: facts.name,
    alternateName: facts.packageName,
    description: facts.description,
    url: absoluteUrl(facts.path),
    codeRepository: `${REPOSITORY_URL}/tree/master/${facts.directory}`,
    programmingLanguage: TYPESCRIPT,
    license: MIT,
    isAccessibleForFree: true,
    ...(facts.runtimes ? { runtimePlatform: [...facts.runtimes] } : {}),
    ...(facts.version ? { version: facts.version } : {}),
    author: reference(organizationNode()),
    publisher: reference(organizationNode()),
    sameAs: [`https://www.npmjs.com/package/${facts.packageName}`],
  }
}
