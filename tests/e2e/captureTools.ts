/**
 * Browser-driven evidence and measurement tools.
 *
 * These files deliberately live beside the E2E harness because they reuse it,
 * but the default Playwright configuration excludes them. Run them through
 * `npm run capture:e2e -- <file-or-grep>` instead.
 */
export const CAPTURE_TEST_FILES = [
  'aaFrameTimeCapture.spec.ts',
  'aaRangeCapture.spec.ts',
  'airborneCapture.spec.ts',
  'attackRangeCapture.spec.ts',
  'bayDoorsCapture.spec.ts',
  'beachesCapture.spec.ts',
  'blenderDuplicatesCapture.spec.ts',
  'bomberRangeCapture.spec.ts',
  'capture.spec.ts',
  'cockpitFamiliesCapture.spec.ts',
  'drapeSpike.spec.ts',
  'f4rGroundCaptures.spec.ts',
  'entityScalingCapture.spec.ts',
  'f4rMaritimeCapture.spec.ts',
  'gunLayingCapture.spec.ts',
  'impactMarkerCapture.spec.ts',
  'l1l2Capture.spec.ts',
  'landGapCapture.spec.ts',
  'landVillageCapture.spec.ts',
  'mainBatteryCapture.spec.ts',
  'mainBatteryFrameTimeCapture.spec.ts',
  'pbyCapture.spec.ts',
  'pursuitAutopilotCapture.spec.ts',
  'rangeTestCapture.spec.ts',
  'shipCaptures.spec.ts',
  'shipCollisionCapture.spec.ts',
  'surfacesCapture.spec.ts',
  'takramGameCapture.spec.ts',
  'terrainCostCapture.spec.ts',
  'terrainMemoryCapture.spec.ts',
  'torpedoCapture.spec.ts',
  'tutorialCapture.spec.ts',
  'vehicleCaptures.spec.ts',
] as const
