/**
 * Carries the request to open the mock wizard, from `openMockWizard`
 * anywhere in Studio's UI to the one wizard `useMockWizard` renders.
 */
export const wizardBus = new EventTarget();
