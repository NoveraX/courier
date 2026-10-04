import type { FrameworkConfig } from "@/features/welcome/frameworks";
import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { cn } from "@/lib/utils";
import {
  AngularLogo,
  AstroLogo,
  NextjsLogo,
  NuxtLogo,
  ReactLogo,
  RemixLogo,
  SolidLogo,
  SvelteLogo,
  VueLogo,
} from "./framework-logos";

const LOGO_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  nextjs: NextjsLogo,
  nuxt: NuxtLogo,
  react: ReactLogo,
  vue: VueLogo,
  sveltekit: SvelteLogo,
  remix: RemixLogo,
  astro: AstroLogo,
  angular: AngularLogo,
  solid: SolidLogo,
};

interface FrameworkPickerProps {
  onSelect: (id: string) => void;
}

export function FrameworkPicker({ onSelect }: FrameworkPickerProps): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-3">
      {FRAMEWORKS.map((fw) => (
        <FrameworkCard key={fw.id} framework={fw} onSelect={() => onSelect(fw.id)} />
      ))}
    </div>
  );
}

function FrameworkCard({
  framework,
  onSelect,
}: {
  framework: FrameworkConfig;
  onSelect: () => void;
}): React.ReactElement {
  const Logo = LOGO_MAP[framework.id];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-all",
        "hover:border-accent-brand/40 hover:bg-accent-brand/5",
      )}
    >
      {Logo && <Logo className="size-8" />}
      <div>
        <p className="text-body-sm font-medium text-foreground">{framework.name}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
          {framework.description}
        </p>
      </div>
    </button>
  );
}
