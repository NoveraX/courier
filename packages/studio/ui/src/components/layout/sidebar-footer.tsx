import { Moon, Sun, Monitor } from "lucide-react";

import { useStudioStore } from "@/store";
import { nextTheme } from "@/app-config";
import { SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";

import type { Theme } from "@/store";

const THEME_ICON: Record<Theme, React.ReactNode> = {
  dark: <Moon className="size-3.5" />,
  light: <Sun className="size-3.5" />,
  system: <Monitor className="size-3.5" />,
};

const THEME_LABEL: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "Auto",
};

export function SidebarFooterSection(): React.ReactNode {
  const theme = useStudioStore((s) => s.theme);
  const setTheme = useStudioStore((s) => s.setTheme);

  return (
    <SidebarFooter className="border-t border-sidebar-border p-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={THEME_LABEL[theme]}
            onClick={() => setTheme(nextTheme(theme))}
            className="h-7 gap-2.5 text-muted-foreground hover:text-foreground"
          >
            {THEME_ICON[theme]}
            <span className="text-body-xs group-data-[collapsible=icon]:hidden">
              {THEME_LABEL[theme]}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
