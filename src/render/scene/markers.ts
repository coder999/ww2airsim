import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/** Known spacing is what turns "something moved" into "I am 300 m up". */
export const MARKER_SPACING_M = 1000

/** Markers each side of the eye, along both axes. */
const MARKER_HALF_COUNT = 8

/**
 * A grid of markers on the sea at a known spacing.
 *
 * Until 2026-09-13 this was a fixed patch spanning +/-10 km along X and only
 * +/-2 km along Z, anchored at the world origin and never moved. The sky was
 * re-centred on the eye from Task 12 and the water from I-1; the markers were
 * the third member of that family and were missed both times. At the spawn's
 * 120 m/s the airplane left the patch sideways in 17 seconds and lengthways
 * in 83, after which design spec section 5's "markers at a known spacing give
 * absolute scale" was simply not true any more -- and the absence is invisible
 * over featureless water, which is why nobody caught it by flying.
 *
 * `recentreMarkers` keeps the grid under the eye. It works because the markers
 * are identical and the grid SNAPS to multiples of `MARKER_SPACING_M`: every
 * marker sits on a world-grid point whichever way the airplane flies, so the
 * pattern is world-locked and no individual marker is ever seen to move. That
 * is what makes them a speed cue rather than decoration.
 */
export function createMarkers(): Object3D {
  const group = new Group()
  const geo = new BoxGeometry(12, 12, 12)
  const mat = new MeshStandardMaterial({ color: 0xd8552f, roughness: 0.6 })
  for (let i = -MARKER_HALF_COUNT; i <= MARKER_HALF_COUNT; i++) {
    for (let j = -MARKER_HALF_COUNT; j <= MARKER_HALF_COUNT; j++) {
      const m = new Mesh(geo, mat)
      m.position.set(i * MARKER_SPACING_M, 6, j * MARKER_SPACING_M)
      group.add(m)
    }
  }
  return group
}

/**
 * Slide the grid under the eye, snapped to its own spacing.
 *
 * Snapping is the whole trick: an unsnapped translation would drag every
 * marker along with the airplane and destroy the parallax they exist for,
 * exactly as an unsnapped water plane would drag its surface detail.
 */
export function recentreMarkers(markers: Object3D, eyeX: number, eyeZ: number): void {
  markers.position.set(
    Math.round(eyeX / MARKER_SPACING_M) * MARKER_SPACING_M,
    0,
    Math.round(eyeZ / MARKER_SPACING_M) * MARKER_SPACING_M,
  )
}
