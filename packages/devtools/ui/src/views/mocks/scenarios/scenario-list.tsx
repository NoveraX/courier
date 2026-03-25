import { motion } from "motion/react";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { ScenarioRow } from "./scenario-row";

import type { MockScenarioEntry } from "@/store/mock-slice";

interface ScenarioListProps {
  scenarios: MockScenarioEntry[];
  activeScenario: string | null;
  selectedScenario: string | null;
  totalRoutes: number;
  onSelect: (scenario: MockScenarioEntry) => void;
  onActivate: (scenario: MockScenarioEntry) => void;
}

export function ScenarioList({
  scenarios,
  activeScenario,
  selectedScenario,
  totalRoutes,
  onSelect,
  onActivate,
}: ScenarioListProps): React.ReactElement {
  const sorted = [...scenarios].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <motion.div
      className="divide-y divide-border-subtle/40"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
    >
      {sorted.map((scenario) => (
        <motion.div key={scenario.name} variants={STAGGER_ITEM_VARIANTS}>
          <ScenarioRow
            scenario={scenario}
            isActive={scenario.name === activeScenario}
            isSelected={scenario.name === selectedScenario}
            totalRoutes={totalRoutes}
            onSelect={onSelect}
            onActivate={onActivate}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
