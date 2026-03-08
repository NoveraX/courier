import { BookOpen, Github, Package } from "lucide-react"

const links = [
  { label: "Documentation", href: "/basic", icon: BookOpen },
  { label: "GitHub", href: "https://github.com/NoveraX/nexus", icon: Github, external: true },
  { label: "npm", href: "https://www.npmjs.com/package/@noverax/nexus", icon: Package, external: true },
]

export function Footer() {
  return (
    <footer className="border-t px-6 py-12 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">@noverax/nexus</span>
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
