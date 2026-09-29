import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TourOverlay } from "./tour-overlay";
import type { TourStep } from "./tour-steps";
import { TOUR_STEPS, TOUR_STORAGE_KEY } from "./tour-steps";
import { TourTooltip } from "./tour-tooltip";

function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  } catch {
    /* noop */
  }
}

/** Dispatch this event to start/restart the tour from anywhere. */
export function restartTour(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent("courier:restart-tour"));
}

export function TourProvider(): React.ReactNode {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const prevStep = useRef(step);

  // Listen for start/restart event
  useEffect(() => {
    const handler = (): void => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("courier:restart-tour", handler);
    return () => window.removeEventListener("courier:restart-tour", handler);
  }, []);

  const currentStep: TourStep | undefined = TOUR_STEPS[step];

  // On step change: hide → scroll → measure → show
  useEffect(() => {
    if (!active || !currentStep) return;

    // Hide tooltip during transition
    const isStepChange = prevStep.current !== step;
    prevStep.current = step;
    if (isStepChange) setVisible(false);

    const el = document.querySelector(currentStep.target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }

    // Measure after scroll, then reveal
    const reveal = setTimeout(
      () => {
        const target = document.querySelector(currentStep.target);
        if (target) {
          setRect(target.getBoundingClientRect());
          setVisible(true);
        }
      },
      isStepChange ? 300 : 0,
    );

    // Keep tracking position (resize, layout shifts)
    const id = setInterval(() => {
      const target = document.querySelector(currentStep.target);
      if (target) setRect(target.getBoundingClientRect());
    }, 400);

    return () => {
      clearTimeout(reveal);
      clearInterval(id);
    };
  }, [active, step, currentStep]);

  const finish = useCallback(() => {
    setActive(false);
    setVisible(false);
    markTourCompleted();
  }, []);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }, [step, finish]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  if (!active || !currentStep || !rect) return null;

  return createPortal(
    <div className="fixed inset-0 z-90">
      <TourOverlay rect={rect} onClose={finish} />
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <TourTooltip
              step={currentStep}
              rect={rect}
              current={step}
              total={TOUR_STEPS.length}
              onNext={next}
              onPrev={prev}
              onSkip={finish}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
