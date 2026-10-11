import { FilePlus2 } from "lucide-react";
import type { UseConfigDeclare } from "@/apis/use-config-declare";
import { formatList } from "@/lib/formatters";
import { FooterAction } from "./footer-action";

/**
 * The declare step's moves: adding the import to the files the change
 * writes — courier.config, and the module it takes its `sources` from when
 * the list lives there — while Studio offers the change, or Not now; Done
 * once it is made or left to the developer.
 *
 * @param props - Declaring the import, and closing the wizard
 * @returns The buttons
 * @example
 * ```tsx
 * <DeclareActions declare={declare} onClose={wizard.close} />
 * ```
 */
export function DeclareActions({
  declare,
  onClose,
}: {
  declare: UseConfigDeclare;
  onClose: () => void;
}): React.ReactNode {
  if (declare.error !== null || declare.answer?.status !== "ready") {
    return <FooterAction label="Done" tone="next" onClick={onClose} />;
  }
  const files = declare.answer.files.map(({ file }) => file.slice(file.lastIndexOf("/") + 1));
  return (
    <>
      <FooterAction label="Not now" tone="outline" disabled={declare.applying} onClick={onClose} />
      <FooterAction
        label={`Add to ${formatList(files)}`}
        icon={FilePlus2}
        busy={declare.applying}
        tone="brand"
        disabled={declare.applying}
        onClick={() => void declare.apply()}
      />
    </>
  );
}
