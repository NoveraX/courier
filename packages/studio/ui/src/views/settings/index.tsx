import { useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { PageShell } from "@/components/shared/page-shell";
import { useSessionHistory } from "@/settings/use-session-history";
import type { Settings } from "@/store/types";
import { ApisSection } from "./apis-section";
import { AppearanceSection } from "./appearance-section";
import { ConnectionSection } from "./connection-section";
import { SECTION_CONFIG } from "./constants";
import { DangerZone } from "./danger-zone";
import { DisplaySection } from "./display-section";
import { ExportSection } from "./export-section";
import { NotificationsSection } from "./notifications-section";
import { RecordingSection } from "./recording-section";
import { SectionNav } from "./section-nav";
import { SectionWrapper } from "./section-wrapper";
import { SessionHistorySection } from "./session-history-section";
import { UnsavedBanner } from "./unsaved-banner";
import { useScrollSpy } from "./use-scroll-spy";
import { useSettingsForm } from "./use-settings-form";

// ── Settings view ────────────────────────────────────────────────────────────

export function SettingsView(): React.ReactNode {
  const { form, isDirty, onSave, onDiscard, onResetDefaults } = useSettingsForm();
  const history = useSessionHistory();
  const [activeSection, setActiveSection] = useState(SECTION_CONFIG[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  useScrollSpy(contentRef, setActiveSection);

  return (
    <PageShell
      toolbar={
        isDirty ? <UnsavedBanner onSave={form.handleSubmit(onSave)} onDiscard={onDiscard} /> : null
      }
      noScroll
    >
      <div className="flex min-h-0 flex-1">
        <SectionNav activeSection={activeSection} />
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mx-auto max-w-2xl space-y-1">
            {SECTION_CONFIG.map((s) => (
              <SectionWrapper
                key={s.id}
                id={s.id}
                icon={s.icon}
                title={s.label}
                description={s.description}
                destructive={s.id === "danger"}
              >
                <SectionContent
                  sectionId={s.id}
                  form={form}
                  history={history}
                  onResetDefaults={onResetDefaults}
                />
              </SectionWrapper>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ── Section content dispatcher ───────────────────────────────────────────────

function SectionContent({
  sectionId,
  form,
  history,
  onResetDefaults,
}: {
  sectionId: string;
  form: UseFormReturn<Settings>;
  history: ReturnType<typeof useSessionHistory>;
  onResetDefaults: () => void;
}): React.ReactNode {
  switch (sectionId) {
    case "appearance":
      return <AppearanceSection form={form} />;
    case "connection":
      return <ConnectionSection form={form} />;
    case "recording":
      return <RecordingSection form={form} />;
    case "display":
      return <DisplaySection form={form} />;
    case "notifications":
      return <NotificationsSection form={form} />;
    case "export":
      return <ExportSection form={form} />;
    case "apis":
      return <ApisSection form={form} />;
    case "sessions":
      return <SessionHistorySection history={history} />;
    case "danger":
      return <DangerZone onResetDefaults={onResetDefaults} history={history} />;
    default:
      return null;
  }
}
