import { describe, expect, it } from 'vitest'
import { flightRecorderSurfaceFromQuery } from '../../src/render/flightRecorderSurface.js'

describe('Dev Flight Recorder reproduction route', () => {
  it('is opt-in on its dedicated query and absent from ordinary routes', () => {
    expect(flightRecorderSurfaceFromQuery('')).toBe(false)
    expect(flightRecorderSurfaceFromQuery('?scenario=free-flight')).toBe(false)
    expect(flightRecorderSurfaceFromQuery('?flightRecorder=0')).toBe(false)
    expect(flightRecorderSurfaceFromQuery('?scenario=free-flight&flightRecorder=1')).toBe(true)
  })
})
