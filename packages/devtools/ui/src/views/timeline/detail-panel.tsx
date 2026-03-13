import { useCallback } from "react"
import { X, Copy } from "lucide-react"

import type { RequestEntry } from "../../store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

import { STATUS_CONFIG, getCodeColor } from "./constants"
import { buildCurl, getRequestLabel } from "./request-helpers"
import { GeneralTab } from "./tabs/general-tab"
import { HeadersTab } from "./tabs/headers-tab"
import { PayloadTab } from "./tabs/payload-tab"
import { ResponseTab } from "./tabs/response-tab"
import { TimingTab } from "./tabs/timing-tab"
import { ProxyTab } from "./tabs/proxy-tab"
import { ErrorTab } from "./tabs/error-tab"

// ── Detail Tab Config ───────────────────────────────────────────────────────

const DETAIL_TABS: { id: string; label: string; show: (r: RequestEntry) => boolean }[] = [
  { id: "general", label: "General", show: () => true },
  { id: "headers", label: "Headers", show: () => true },
  { id: "payload", label: "Payload", show: (r) => r.variables !== undefined },
  { id: "response", label: "Response", show: (r) => r.data !== undefined },
  { id: "timing", label: "Timing", show: (r) => !!r.timing },
  { id: "proxy", label: "Proxy", show: (r) => r.mode === "proxy" },
  { id: "error", label: "Error", show: (r) => !!r.error },
]

// ── Detail Panel ────────────────────────────────────────────────────────────

export function DetailPanel({
  request, onClose,
}: {
  request: RequestEntry
  onClose: () => void
}) {
  const label = getRequestLabel(request)
  const statusCfg = STATUS_CONFIG[request.status]
  const visibleTabs = DETAIL_TABS.filter((t) => t.show(request))

  const copyAsCurl = useCallback(() => {
    navigator.clipboard.writeText(buildCurl(request))
  }, [request])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <DetailPanelHeader
        label={label}
        statusDotClass={statusCfg.dotClass}
        statusCode={request.statusCode}
        onCopyCurl={copyAsCurl}
        onClose={onClose}
      />

      {/* Tabs */}
      <Tabs defaultValue="general" className="flex flex-1 flex-col gap-0 overflow-hidden">
        <TabsList variant="line" className="h-8 w-full shrink-0 justify-start overflow-x-auto px-1">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="h-7 px-2.5 text-[11px]">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
        <div className="p-3 text-xs">
          <TabsContent value="general"><GeneralTab request={request} /></TabsContent>
          <TabsContent value="headers"><HeadersTab request={request} /></TabsContent>
          <TabsContent value="payload"><PayloadTab request={request} /></TabsContent>
          <TabsContent value="response"><ResponseTab request={request} /></TabsContent>
          <TabsContent value="timing"><TimingTab request={request} /></TabsContent>
          <TabsContent value="proxy"><ProxyTab request={request} /></TabsContent>
          <TabsContent value="error"><ErrorTab request={request} /></TabsContent>
        </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function DetailPanelHeader({
  label, statusDotClass, statusCode, onCopyCurl, onClose,
}: {
  label: string
  statusDotClass: string
  statusCode: number | undefined
  onCopyCurl: () => void
  onClose: () => void
}) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-border px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("size-2 shrink-0 rounded-full", statusDotClass)} />
        <span className="truncate font-mono text-xs text-muted-foreground">{label}</span>
        {statusCode != null && (
          <Badge variant="outline" className={cn("h-5 text-[10px]", getCodeColor(statusCode))}>
            {statusCode}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" onClick={onCopyCurl}>
              <Copy className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Copy as cURL</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
