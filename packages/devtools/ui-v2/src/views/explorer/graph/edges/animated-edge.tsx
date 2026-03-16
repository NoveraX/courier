import { memo } from "react";
import { getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { ExplorerEdgeData, EdgeTier } from "../../types";
import { EDGE_CONFIG, PARTICLE_CONFIG } from "../../constants";

// ── Gradient ID per tier ────────────────────────────────────────────────────

const GRADIENT_BY_TIER: Record<EdgeTier, string> = {
  "source-to-group": "url(#edge-grad-source)",
  "source-to-endpoint": "url(#edge-grad-source)",
  "group-to-endpoint": "url(#edge-grad-group)",
};

const PARTICLE_COLOR_BY_TIER: Record<EdgeTier, string> = {
  "source-to-group": "oklch(0.65 0.18 280)",
  "source-to-endpoint": "oklch(0.65 0.18 280)",
  "group-to-endpoint": "oklch(0.60 0.14 230)",
};

// ── Edge component ──────────────────────────────────────────────────────────

function AnimatedEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps): React.ReactElement {
  const d = data as ExplorerEdgeData | undefined;
  const isActive = d?.isActive ?? false;
  const hasErrors = d?.hasErrors ?? false;
  const tier = d?.tier ?? "group-to-endpoint";

  const [path] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const gradientUrl = hasErrors ? "url(#edge-grad-error)" : GRADIENT_BY_TIER[tier];
  const particleColor = hasErrors ? "oklch(0.71 0.19 29)" : PARTICLE_COLOR_BY_TIER[tier];

  return (
    <g className={isActive ? "edge-active" : undefined}>
      {/* Base path — always visible, dashed when idle */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke={isActive ? undefined : "oklch(0.30 0 0)"}
        strokeWidth={EDGE_CONFIG.strokeWidth}
        strokeDasharray={isActive ? undefined : "8 4"}
        strokeOpacity={isActive ? 0 : 0.4}
      />

      {/* Active overlay — gradient stroke + glow */}
      {isActive && (
        <path
          d={path}
          fill="none"
          stroke={gradientUrl}
          strokeWidth={EDGE_CONFIG.activeStrokeWidth}
          strokeOpacity={0.85}
          filter="url(#edge-glow)"
        />
      )}

      {/* Flowing particles — staggered circles along path */}
      {isActive && <EdgeParticles path={path} color={particleColor} />}
    </g>
  );
}

export const AnimatedEdge = memo(AnimatedEdgeComponent);

// ── Particles ───────────────────────────────────────────────────────────────

function EdgeParticlesComponent({ path, color }: { path: string; color: string }): React.ReactElement {
  return (
    <>
      {Array.from({ length: PARTICLE_CONFIG.count }, (_, i) => (
        <circle
          key={i}
          r={PARTICLE_CONFIG.size}
          fill={color}
          opacity={0.9}
          filter="url(#particle-glow)"
        >
          <animateMotion
            dur={`${PARTICLE_CONFIG.speed + i * 0.3}s`}
            repeatCount="indefinite"
            begin={`${i * 0.7}s`}
            path={path}
          />
        </circle>
      ))}
    </>
  );
}

const EdgeParticles = memo(EdgeParticlesComponent);
