import { createPlaywrightConfig } from './playwright.config.js'

// Selecting this config is the explicit opt-in. Existing capture programs
// keep their defensive E2E_CAPTURE guard for direct/historical invocations.
process.env.E2E_CAPTURE = '1'

export default createPlaywrightConfig('capture')
