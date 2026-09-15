import { BookOpen, Package } from "lucide-react"

import { GithubIcon } from "@/components/icons/github"
import { CourierLogo } from "@/components/courier-logo"

const links = [
  { label: "Documentation", href: "/docs/introduction", icon: BookOpen },
  { label: "GitHub", href: "https://github.com/NoveraX/courier", icon: GithubIcon, external: true },
  {
    label: "npm",
    href: "https://www.npmjs.com/package/@noverax/courier",
    icon: Package,
    external: true,
  },
]

export function Footer() {
  return (
    <footer className="border-t px-6 py-12 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CourierLogo variant="icon" width={18} height={18} />
          <span className="font-semibold text-foreground">@noverax/courier</span>
          {" · "}
          MIT License
        </div>
        <nav className="flex gap-6">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
