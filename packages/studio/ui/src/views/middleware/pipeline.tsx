import { Connector, FetchNode, OverheadSummary, PhaseLabel } from "./pipeline-parts";
import { StepCard } from "./step-card";
import type { ChainEntry, MiddlewareStep } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface PipelineProps {
  chain: ChainEntry;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Pipeline({ chain }: PipelineProps): React.ReactElement {
  const maxDuration = Math.max(...chain.steps.map((s) => s.duration), 0.001);

  // Split steps: "before"/"wrap" show before fetch, "after"/"wrap" show after
  const beforeSteps = chain.steps.filter((s) => s.phase === "request" || s.phase === "wrap");
  const afterSteps = chain.steps.filter((s) => s.phase === "response" || s.phase === "wrap");

  let stepIdx = 0;

  return (
    <div className="flex flex-col items-center gap-0 py-2">
      {beforeSteps.length > 0 && (
        <>
          <PhaseLabel label="Before Fetch" delay={0} />
          <Connector delay={0.05} />
          {beforeSteps.map((step) => (
            <StepSection
              key={`before-${step.index}`}
              step={step}
              subPhase="before"
              maxDuration={maxDuration}
              index={stepIdx++}
            />
          ))}
        </>
      )}

      {chain.reachedFetch && <FetchNode delay={stepIdx * 0.05 + 0.1} />}

      {afterSteps.length > 0 && (
        <>
          <Connector delay={stepIdx * 0.05 + 0.2} />
          <PhaseLabel label="After Fetch" delay={stepIdx * 0.05 + 0.25} />
          <Connector delay={stepIdx * 0.05 + 0.3} />
          {afterSteps.map((step, i) => (
            <StepSection
              key={`after-${step.index}`}
              step={step}
              subPhase="after"
              maxDuration={maxDuration}
              index={stepIdx++}
              isLast={i === afterSteps.length - 1}
            />
          ))}
        </>
      )}

      <OverheadSummary
        overhead={chain.totalOverhead}
        percent={chain.overheadPercent}
        delay={stepIdx * 0.05 + 0.2}
      />
    </div>
  );
}

// ── Step with connector ────────────────────────────────────────────────────

function StepSection({
  step,
  subPhase,
  maxDuration,
  index,
  isLast = false,
}: {
  step: MiddlewareStep;
  subPhase: "before" | "after";
  maxDuration: number;
  index: number;
  isLast?: boolean;
}): React.ReactElement {
  return (
    <div className="flex w-full flex-col items-center">
      <div className="w-full px-8">
        <StepCard step={step} maxDuration={maxDuration} index={index} subPhase={subPhase} />
      </div>
      {!isLast && <Connector delay={index * 0.05 + 0.15} />}
    </div>
  );
}
