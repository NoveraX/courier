import { useState } from "react";

import type { PackageManager } from "@/features/welcome/install-command";
import { installCommand, PACKAGE_MANAGERS } from "@/features/welcome/install-command";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

interface InstallStepProps {
  /** The step's commands, as written for npm. */
  npmCommands: string;
  onCopied: () => void;
}

/**
 * The install command, for the package manager picked from the tabs.
 *
 * @param props - The commands, and who to tell once they are copied
 * @returns The command box
 * @example
 * ```tsx
 * <InstallStep npmCommands={step.code ?? ""} onCopied={() => markCopied(step.id)} />
 * ```
 */
export function InstallStep({ npmCommands, onCopied }: InstallStepProps): React.ReactNode {
  const [manager, setManager] = useState<PackageManager>("npm");
  const command = installCommand(npmCommands, manager);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-inset">
      <div
        role="tablist"
        aria-label="Package manager"
        className="flex items-center gap-0.5 border-b border-line pt-1 pr-1 pl-2"
      >
        {PACKAGE_MANAGERS.map((pm) => (
          <button
            key={pm}
            type="button"
            role="tab"
            aria-selected={pm === manager}
            onClick={() => setManager(pm)}
            className={cn(
              "-mb-px h-7 cursor-pointer border-b-[1.5px] px-2.5 font-mono text-label transition-colors pointer-coarse:h-10",
              pm === manager
                ? "border-brand text-fg"
                : "border-transparent text-fg-subtle hover:text-fg-muted",
            )}
          >
            {pm}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 py-3 pr-2.5 pl-3.5">
        <code className="min-w-0 flex-1 overflow-auto text-control whitespace-pre text-syntax-plain">
          {command.split("\n").map((line) => (
            <div key={line}>
              <span className="text-fg-subtle select-none">$ </span>
              {line}
            </div>
          ))}
        </code>
        <CopyButton text={command} onCopied={onCopied} className="h-6.5 rounded-md" />
      </div>
    </div>
  );
}
