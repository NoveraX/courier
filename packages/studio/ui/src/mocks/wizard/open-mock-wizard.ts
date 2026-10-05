import { wizardBus } from "./wizard-bus";

/**
 * Open the mock wizard from anywhere in Studio's UI, on its first step.
 *
 * @returns Nothing; the wizard `useMockWizard` renders opens
 *
 * @example
 * ```tsx
 * <Button onClick={openMockWizard}>Generate mocks</Button>
 * ```
 */
export function openMockWizard(): void {
  wizardBus.dispatchEvent(new Event("open"));
}
