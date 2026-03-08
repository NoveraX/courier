import {
  ArrowLeftRight,
  FileCode2,
  Layers,
  Route,
  Server,
  Shield,
  Upload,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Proxy Mode",
    description: "Browser → Next.js → Backend. Hides secrets, handles CORS and cookie forwarding.",
    href: "/basic",
    icon: ArrowLeftRight,
    badge: "Core",
  },
  {
    title: "Direct Mode",
    description: "Server-side requests from RSC/Actions without the proxy hop.",
    href: "/direct",
    icon: Server,
    badge: "Core",
  },
  {
    title: "Request Groups",
    description: "Organize API methods with prefixes and the group:method syntax.",
    href: "/groups",
    icon: Layers,
    badge: "Organization",
  },
  {
    title: "Path Parameters",
    description: "Dynamic URL segments with :id, :postId and pathOptions callback.",
    href: "/path-params",
    icon: Route,
    badge: "Routing",
  },
  {
    title: "File Upload",
    description: "FormData handling with multipart/form-data support.",
    href: "/upload",
    icon: Upload,
    badge: "I/O",
  },
  {
    title: "Hooks",
    description: "onRequest, onResponse, and onError lifecycle hooks.",
    href: "/hooks",
    icon: FileCode2,
    badge: "Lifecycle",
  },
  {
    title: "Error Handling",
    description: "HTTPError class, isHTTPError guard, global error handlers.",
    href: "/errors",
    icon: Shield,
    badge: "Safety",
  },
  {
    title: "Streaming",
    description: "ReadableStream responses with progressive rendering.",
    href: "/streaming",
    icon: Zap,
    badge: "Performance",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">@noverax/nexus</h1>
        <p className="text-lg text-muted-foreground">
          Type-safe HTTP client with request grouping, path parameters, and Next.js integration.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Architecture</p>
        <p className="mt-1 font-mono text-muted-foreground">
          Browser → Next.js (proxy) → Express (backend)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                <feature.icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      {feature.badge}
                    </Badge>
                  </div>
                  <CardDescription>{feature.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
