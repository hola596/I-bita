"use client";

import { useCallback, useState } from "react";

export type StepDirection = "forward" | "backward";

/**
 * Hook reutilizable para asistentes de registro progresivo multi-paso
 * (inspirado en Marcosfitzsimons/multi-step-form).
 */
export function useMultiStepOnboarding(totalSteps: number, initialStep = 0) {
  const safeTotal = Math.max(1, totalSteps);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(
    Math.min(Math.max(0, initialStep), safeTotal - 1)
  );
  const [direction, setDirection] = useState<StepDirection>("forward");
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const nextStep = useCallback(() => {
    setDirection("forward");
    setCurrentStepIndex((prev) => (prev < safeTotal - 1 ? prev + 1 : prev));
  }, [safeTotal]);

  const previousStep = useCallback(() => {
    setDirection("backward");
    setCurrentStepIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= safeTotal) return;
      setDirection(index >= currentStepIndex ? "forward" : "backward");
      setIsCompleted(false);
      setCurrentStepIndex(index);
    },
    [currentStepIndex, safeTotal]
  );

  const markCompleted = useCallback(() => {
    setDirection("forward");
    setIsCompleted(true);
  }, []);

  const progressPct = isCompleted
    ? 100
    : Math.round(((currentStepIndex + 1) / safeTotal) * 100);

  return {
    currentStepIndex,
    direction,
    totalSteps: safeTotal,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === safeTotal - 1,
    isCompleted,
    progressPct,
    nextStep,
    previousStep,
    goTo,
    markCompleted,
  };
}
