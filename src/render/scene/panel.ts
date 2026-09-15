import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Object3D,
  type Texture,
} from 'three'
import {
  GAUGES,
  needleAngleFor,
  attitudeAngles,
  tickMarksFor,
  labelTextFor,
  readoutTextFor,
  gaugeValue,
  fractionForValue,
  tapeOffsetFor,
  type GaugeId,
  type DialSpec,
  type ColumnSpec,
  type TapeSpec,
} from '../gauges.js'
import { makeTextTexture, type TextTextureFactory } from './text.js'
import {
  DIAL_GAP,
  DIAL_RADIUS,
  PANEL_AHEAD_M,
  PANEL_BANDS,
  PANEL_SLOTS,
  metresBelowEye,
} from './panelLayout.js'
import { CAMERA_VFOV_DEG } from '../camera.js'
import type { AircraftState, Controls } from '../../sim/flight/state.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'

export type Panel = {
  readonly root: Object3D
  /** The reflector gunsight's reticle. On the boresight, so it is where the
   *  guns point rather than where the panel is. */
  readonly reticle: Object3D
  readonly needles: Map<GaugeId, Object3D>
  /** The digital readout plate inside each dial, and the string it currently
   *  shows -- kept so `updatePanel` can skip re-rasterising an unchanged one. */
  readonly readouts: Map<GaugeId, Readout>
  /** Column gauges (today: only `throttle`) -- the light bar `updatePanel`
   *  scales on Y to show how full the control's travel is. */
  readonly columns: Map<GaugeId, { readonly fill: Object3D }>
  readonly horizon: Object3D
  /** The full-width coaming plate. Runs past the bottom of the frame on
   *  purpose (see `createPanel`), so it reads as clipped rather than
   *  floating with sky visible beneath it. */
  readonly backing: Object3D
  /**
   * The heading tape: a sliding compass strip across the upper band, with a
   * fixed index and digital readout at its centre (Task 5, 2026-09-15).
   *
   * `strip` is the only piece `updatePanel` moves -- `updatePanel` sets its
   * `position.x` each frame (`tapeOffsetFor`, gauges.ts). It carries the rose
   * drawn THREE TIMES end to end, so sliding within the middle copy always
   * has a neighbour rendered on both sides and crossing north never exposes
   * an edge or jumps the whole strip. `readout` is the fixed digital
   * readout -- parented apart from `strip` so it does not slide with it.
   * There is no `slotX('heading')`: `PANEL_SLOTS` deliberately has no
   * `heading` entry (context point 4, task-5-brief.md) because the tape
   * spans the UPPER band's width rather than a row slot.
   */
  readonly tape: {
    readonly strip: Object3D
    readonly readout: Mesh
  }
}

export type Readout = {
  readonly mesh: Mesh
  text: string
}

/**
 * Deliberately oversized and high-contrast rather than period-accurate.
 *
 * Authenticity of APPEARANCE is traded away on purpose: faithful 1944 markings
 * that cannot be read at a realistic eye point would be accurate and useless,
 * and this plan exists to let a human judge how the aeroplane flies. What is
 * NOT traded away is the data -- every needle here is backed by a quantity the
 * flight model produces, which is why there is no tachometer (see gauges.ts's
 * doc comment on GaugeId).
 */
// DIAL_RADIUS and DIAL_GAP now live in panelLayout.ts, alongside PANEL_SLOTS
// which is built from them -- see that module's doc comment for the
// horizontal-budget history (2026-09-13 narrowing, 2026-09-15 confirmation).
/**
 * Narrowest window the panel is designed to fit, width over height.
 *
 * 3:2 covers the Surface this has actually been flown on, and with it every
 * 16:10, 16:9 and ultrawide shape. A 4:3 or square window still clips the
 * outer dials; that is a stated limit rather than an accident, and
 * `panel.test.ts` pins the built geometry against this number.
 */
export const PANEL_MIN_ASPECT = 1.5
// Depth ordering within a dial. All small and all positive, so everything
// stays in front of the face without needing render-order fiddling.
const Z_MARKS = 0.0015
const Z_READOUT = 0.0025
const Z_NEEDLE = 0.005

/**
 * The heading tape's visible window, metres. Exported so tests can derive
 * the strip's own full-rose width (`TAPE_W * (360 / windowSpan)`) without
 * hardcoding it a second time -- gauges.ts's `tapeOffsetFor` reports the
 * offset as a FRACTION of that width, and `updatePanel` scales by it.
 */
export const TAPE_W = 0.30

/** Panel centre relative to the pilot's eye, body frame (+X forward, +Y up).
 *  Re-exported from panelLayout.ts for backwards compatibility. */
export { PANEL_AHEAD_M }
/**
 * How far below the eye the dial row is centred.
 *
 * Was 0.35 until 2026-09-13, which put the label edge 38.4 degrees below the
 * eye line against the 30-degree screen edge of `CAMERA_VFOV_DEG`. The lower
 * half of every dial, every label and every digital readout were outside the
 * frustum; only the top slivers of six discs were ever visible, which is why
 * flying it produced "would also label the instruments with text" about a
 * panel that had been labelled since the commit before.
 *
 * `panel.test.ts` now measures the built geometry against the camera's own
 * exported field of view, so a bigger dial or a narrower lens fails there
 * rather than in a screenshot. Design spec section 7 already settled the
 * principle: legibility beats period authenticity, and markings that cannot
 * be read at a realistic eye point are faithful and useless.
 */
export const PANEL_BELOW_M = 0.19

/** Beyond this the horizon is well off screen and `tan` runs away. */
const MAX_HORIZON_PITCH = (75 * Math.PI) / 180
/**
 * The horizon bar's depth within the panel, and its distance from the eye.
 *
 * The panel root is turned -90 degrees about Y, which sends local +Z to body
 * -X: a bar nudged forward off the panel face in local +Z is 2 mm CLOSER to
 * the pilot, not further. Small, but the bar's placement divides by this
 * distance, and using 0.6 instead of 0.598 left a 0.33% error that the
 * screen-position test caught.
 */
const HORIZON_Z = -0.003
const HORIZON_DISTANCE_M = PANEL_AHEAD_M - HORIZON_Z
/**
 * The reflector sight, as an angle rather than a size.
 *
 * A gunsight is aimed, so what matters is how much sky it covers, not how many
 * millimetres of glass it is drawn on. The cross spans 3 degrees with a 1
 * degree gap at the middle -- wide enough to read against sea and cloud, open
 * enough to leave the target visible, which is the whole point of the gap.
 * Converted to metres at the sight's own distance below, so moving the panel
 * cannot silently change how big the sight looks.
 */
const RETICLE_SPAN_DEG = 3
const RETICLE_GAP_DEG = 1
/** In front of the horizon bar, so the bar cannot cut across the sight. */
const RETICLE_Z = -0.004

/** The coaming: an opaque plate the horizon bar passes behind. */
const BACKING_Z = -0.001

/**
 * A flat plate carrying rasterised text.
 *
 * Text is a texture rather than geometry because three's `TextGeometry` needs
 * a font asset this project does not ship, and a stroke-font built out of
 * boxes would be a lot of code to render six words. The rasteriser is injected
 * (see `text.ts`) so the panel can still be BUILT on a machine with no canvas,
 * which is every machine this project is developed on -- the tests assert the
 * layout and the exact strings; only the pixels need a browser.
 */
function textPlate(
  text: string,
  widthM: number,
  heightM: number,
  makeText: TextTextureFactory,
): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(widthM, heightM),
    new MeshBasicMaterial({ map: makeText(text, widthM / heightM), transparent: true }),
  )
  return mesh
}

function setPlateText(mesh: Mesh, text: string, makeText: TextTextureFactory): void {
  const material = mesh.material as MeshBasicMaterial
  const previous: Texture | null = material.map
  const { width, height } = (mesh.geometry as PlaneGeometry).parameters
  material.map = makeText(text, width / height)
  material.needsUpdate = true
  // The old canvas texture is replaced every time the displayed value changes,
  // which for the altimeter is several times a second. Not disposing it leaks
  // one GPU texture per change for the life of the tab.
  previous?.dispose()
}

export function createPanel(spec: AircraftSpec, makeText: TextTextureFactory = makeTextTexture): Panel {
  const root = new Group()
  const needles = new Map<GaugeId, Object3D>()
  const readouts = new Map<GaugeId, Readout>()
  let tape: Panel['tape']

  const faceMat = new MeshBasicMaterial({ color: 0x101418 })
  const needleMat = new MeshBasicMaterial({ color: 0xffd24a })
  const bezelMat = new MeshBasicMaterial({ color: 0x2b3238 })
  const markMajorMat = new MeshBasicMaterial({ color: 0xf2f6f8 })
  const markMinorMat = new MeshBasicMaterial({ color: 0x8fa0ab })

  // Round dials only. A column or a tape is a different shape entirely --
  // giving one a needle and a bezel here is exactly the bug this filter
  // exists to prevent (controller ruling R1, 2026-09-15: the lower row is
  // five dials plus the ball, not six dials). Rendering a column or a tape
  // is a later task's; for now they exist only in `GAUGES` and are not drawn.
  const dialGauges = GAUGES.filter((g): g is DialSpec => g.kind === 'dial')

  // Layout slots are keyed by id (panelLayout.ts's PANEL_SLOTS), not by
  // position in this array -- the row has a hole where the attitude ball
  // will go, so a dial's index here is not its index in the slot table.
  const slotX = (id: string): number => {
    const slot = PANEL_SLOTS.find((s) => s.id === id)
    if (!slot) throw new Error(`no layout slot for ${id}`)
    return slot.centreX
  }
  const lowerCentre = (PANEL_BANDS.lower.top + PANEL_BANDS.lower.bottom) / 2

  dialGauges.forEach((g) => {
    const dial = new Group()
    const x = slotX(g.id)

    const face = new Mesh(new CircleGeometry(DIAL_RADIUS, 32), faceMat)
    dial.add(face)

    // A bezel, so a dial reads as an instrument rather than a hole.
    const bezel = new Mesh(new RingGeometry(DIAL_RADIUS, DIAL_RADIUS * 1.09, 32), bezelMat)
    bezel.position.z = Z_MARKS
    dial.add(bezel)

    // Scale marks. Without these the dial had no zero, which made
    // needleAngleFor's documented "clockwise from the dial's zero" a
    // reference to something that did not exist (whole-branch review, I-2).
    for (const mark of tickMarksFor(g)) {
      const len = DIAL_RADIUS * (mark.major ? 0.16 : 0.09)
      const tick = new Mesh(
        new BoxGeometry(mark.major ? 0.005 : 0.0025, len, 0.002),
        mark.major ? markMajorMat : markMinorMat,
      )
      // Marks sit just inside the rim, and the whole tick is rotated about
      // the dial centre by the SAME angle the needle uses for that value --
      // `tickMarksFor` and `needleAngleFor` both call `angleForValue`, so a
      // needle cannot point between its own marks.
      const r = DIAL_RADIUS - len / 2 - 0.004
      const a = mark.angleRad
      tick.position.set(r * Math.sin(a), r * Math.cos(a), Z_MARKS)
      tick.rotation.z = -a
      dial.add(tick)

      if (mark.major && mark.text) {
        const numeral = textPlate(mark.text, DIAL_RADIUS * 0.36, DIAL_RADIUS * 0.17, makeText)
        // Inside the ticks, not on them. At 0.6 the numeral's own half-width
        // reached the major tick at the scale ends -- "10000" sat across the
        // 9 o'clock mark on the altimeter, which the reference platform showed
        // plainly and no test measured (2026-09-13).
        //
        // The radius is squeezed between two constraints that were solved
        // together rather than by trial: the plate must clear the ticks
        // (nr + halfWidth <= tick inner edge) and adjacent plates must clear
        // each other (nr * angleStep >= plate width). The slip dial binds the
        // second one at 45 degrees between majors, and at the original plate
        // size the two constraints had no overlapping solution -- hence the
        // shorter major ticks and the narrower plate above.
        const nr = DIAL_RADIUS * 0.53
        numeral.position.set(nr * Math.sin(a), nr * Math.cos(a), Z_MARKS)
        dial.add(numeral)
      }
    }

    const needle = new Mesh(new BoxGeometry(0.006, DIAL_RADIUS * 1.1, 0.004), needleMat)
    // Offset so the mesh pivots about the dial centre rather than its own end.
    needle.geometry.translate(0, DIAL_RADIUS * 0.45, 0)
    needle.position.z = Z_NEEDLE
    dial.add(needle)
    needles.set(g.id, needle)

    // The name and unit, which GAUGES has carried since Task 10 with nothing
    // rendering them -- zero non-definition hits across src, tests and tools
    // before this (whole-branch review, I-2).
    const label = textPlate(labelTextFor(g), DIAL_GAP * 0.86, 0.024, makeText)
    label.position.set(0, -0.088, Z_MARKS)
    dial.add(label)

    // Digital readout, ABOVE the dial rather than inside it. Inside, it
    // collided with the scale numerals along the bottom of the face -- the
    // altimeter's "605" was drawn across its own 8000 and 6000 marks. A
    // three-quarter sweep covers the bottom of the dial, so there is no clear
    // window down there to put it in. Per design spec section 7's "digital
    // readouts alongside needles where that helps". It helps most for altitude and heading, where
    // reading a needle to better than a few hundred metres or a few degrees is
    // exactly what the oversized-dial trade gave up.
    const readoutMesh = textPlate('', DIAL_RADIUS * 1.15, 0.022, makeText)
    readoutMesh.position.set(0, 0.088, Z_READOUT)
    dial.add(readoutMesh)
    readouts.set(g.id, { mesh: readoutMesh, text: '' })

    dial.name = `dial:${g.id}`
    dial.position.set(x, PANEL_BELOW_M - lowerCentre, 0)
    root.add(dial)
  })
  // radar and armament are layout slots only (PANEL_SLOTS) -- nothing is
  // added to `root` for them. An unlit bezel that never fills reads as a
  // broken instrument; the space is reserved in the arithmetic until a later
  // plan has something to draw there.

  // Column gauges: a vertical light bar, not a needle -- Mark asked for this
  // one (Task 4, 2026-09-15) after pressing the throttle key and seeing
  // nothing on the panel move, and reasonably concluding the aeroplane was
  // broken. `throttle` is the only entry with `kind: 'column'` today.
  const columnGauges = GAUGES.filter((g): g is ColumnSpec => g.kind === 'column')
  const columns = new Map<GaugeId, { readonly fill: Object3D }>()

  // A band's local y is `PANEL_BELOW_M - band` (panelLayout.ts's doc
  // comment): `top` is the smaller "metres below eye" figure, so it maps to
  // the LARGER, more-upward y. The column is full-height in the lower band,
  // so its bezel spans exactly that span -- no more, or it would eat the
  // 1-degree horizontal margin `panelLayout.test.ts` pins for this slot.
  const columnTopY = PANEL_BELOW_M - PANEL_BANDS.lower.top
  const columnBottomY = PANEL_BELOW_M - PANEL_BANDS.lower.bottom
  const columnH = columnTopY - columnBottomY
  const columnCentreY = (columnTopY + columnBottomY) / 2
  // Thin enough that a numeral or a tick never has to fight the bezel for
  // room; the face's own extent is what everything else below is sized from.
  const COLUMN_BEZEL_T = 0.004

  columnGauges.forEach((g) => {
    const slot = PANEL_SLOTS.find((s) => s.id === g.id)
    if (!slot) throw new Error(`no layout slot for ${g.id}`)
    const { centreX: x, widthM } = slot

    const column = new Group()

    // Bezel spans the slot's FULL width, matching it exactly rather than
    // overhanging it -- the brief's stop condition ("if anything you draw
    // would exceed the slot width, STOP") is met by construction: nothing
    // below is wider than this plate.
    const bezel = new Mesh(new PlaneGeometry(widthM, columnH), bezelMat)
    column.add(bezel)

    const faceW = widthM - COLUMN_BEZEL_T * 2
    const fullH = columnH - COLUMN_BEZEL_T * 2
    const face = new Mesh(new PlaneGeometry(faceW, fullH), faceMat)
    face.position.z = Z_MARKS / 2
    column.add(face)

    // Ticks and numerals live in the left part of the face; the fill bar
    // occupies the right part, so a full-throttle bar never runs under its
    // own "100" numeral (brief step 3: "a fill plane on the right").
    const fillW = faceW * 0.34
    const tickZoneW = faceW - fillW
    const fillX = faceW / 2 - fillW / 2
    const tickLeftX = -faceW / 2

    // Nine marks (0, 12.5, .. 100 per GAUGES' throttle entry), numerals only
    // at the two majors, 0 and 100 -- exactly what the brief asks for.
    for (const mark of tickMarksFor(g)) {
      const len = tickZoneW * (mark.major ? 0.62 : 0.36)
      const y = -fullH / 2 + mark.fraction * fullH
      const tick = new Mesh(
        new BoxGeometry(len, mark.major ? 0.005 : 0.0025, 0.002),
        mark.major ? markMajorMat : markMinorMat,
      )
      tick.position.set(tickLeftX + len / 2, y, Z_MARKS)
      column.add(tick)

      if (mark.major && mark.text) {
        const numeral = textPlate(mark.text, tickZoneW * 0.8, 0.018, makeText)
        // Nudged inward from the very top/bottom edge so the 0 and 100
        // numerals do not print half off the top or bottom of the face.
        const ny = mark.fraction === 0 ? y + 0.011 : mark.fraction === 1 ? y - 0.011 : y
        numeral.position.set(tickLeftX + tickZoneW * 0.42, ny, Z_MARKS)
        column.add(numeral)
      }
    }

    const fill = new Mesh(new PlaneGeometry(fillW, fullH), new MeshBasicMaterial({ color: 0xc8ccd2 }))
    // A PlaneGeometry is centred on its own origin, so scaling it on Y grows
    // it in BOTH directions and the bar creeps downward out of its own
    // bezel. Move the origin to the bar's BASE first, so `scale.y` only
    // grows it upward -- tests/render/panel.test.ts's "grows the throttle
    // fill upward from its base" is the regression test for this line.
    fill.geometry.translate(0, fullH / 2, 0)
    fill.position.set(fillX, -fullH / 2, Z_NEEDLE)
    column.add(fill)
    columns.set(g.id, { fill })

    column.name = `column:${g.id}`
    column.position.set(x, columnCentreY, 0)
    root.add(column)
  })

  // The bar now sits BEHIND an opaque coaming rather than in front of the
  // dials. I-7 replaced its clamped offset with exact geometry, which is
  // right, but exact geometry means it keeps travelling: from 8 degrees
  // nose-up it reached the dial faces and by 17.5 it crossed the centres of
  // the two inner dials, drawn over their scale marks and under their
  // needles -- a layering nobody chose. Letting the panel occlude it is what
  // a real coaming does, and it needs no clamp to do it.
  //
  // Full width at the NARROWEST supported window, so a wider one still has
  // the bezel reaching both edges rather than stopping short of them.
  const halfV = Math.tan(((CAMERA_VFOV_DEG / 2) * Math.PI) / 180)
  const backingHalfW = PANEL_MIN_ASPECT * halfV * PANEL_AHEAD_M * 1.02
  // Past the frame edge, not up to it (Task 3, 2026-09-15): this is the clip
  // that stops the panel reading as a strip floating in mid-screen with sky
  // visible below it. `panel.test.ts`'s "runs the bezel past the bottom of
  // the frame" pins this against the camera's own vertical half-angle.
  const backingBottom = metresBelowEye(CAMERA_VFOV_DEG / 2) * 1.15
  const backingTop = PANEL_BANDS.upper.top

  const backing = new Mesh(
    new PlaneGeometry(backingHalfW * 2, backingBottom - backingTop),
    new MeshBasicMaterial({ color: 0x0b0e11 }),
  )
  backing.name = 'backing'
  backing.position.set(0, PANEL_BELOW_M - (backingTop + backingBottom) / 2, BACKING_Z)
  root.add(backing)

  const horizon = new Mesh(
    new BoxGeometry(DIAL_RADIUS * 1.6, 0.01, 0.004),
    new MeshBasicMaterial({ color: 0x6fd3ff }),
  )
  horizon.position.set(0, PANEL_BELOW_M, HORIZON_Z)
  root.add(horizon)

  // The sight sits at local (0, PANEL_BELOW_M) -- the boresight -- NOT at the
  // panel's own origin, which is PANEL_BELOW_M below the eye. `panel.test.ts`
  // projects it and requires dead centre at five attitudes, which is the check
  // that a sight drawn on the panel face would fail.
  const reticle = new Group()
  reticle.name = 'reticle'
  const sightDistance = PANEL_AHEAD_M - RETICLE_Z
  const armM = sightDistance * Math.tan((RETICLE_SPAN_DEG * Math.PI) / 360)
  const gapM = sightDistance * Math.tan((RETICLE_GAP_DEG * Math.PI) / 360)
  const strokeM = armM * 0.09
  const reticleMat = new MeshBasicMaterial({ color: 0xffdf7a })
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const long = armM - gapM
    const arm = new Mesh(
      new PlaneGeometry(dx === 0 ? strokeM : long, dy === 0 ? strokeM : long),
      reticleMat,
    )
    arm.position.set(dx * (gapM + long / 2), dy * (gapM + long / 2), 0)
    reticle.add(arm)
  }
  reticle.position.set(0, PANEL_BELOW_M, RETICLE_Z)
  root.add(reticle)

  // The heading tape: a sliding compass strip across the upper band,
  // replacing the round HEADING dial (Task 5, 2026-09-15). Positioned from
  // `PANEL_BANDS.upper` directly, NOT from `slotX` -- `PANEL_SLOTS` has no
  // `heading` entry (deliberate: F4/context point 4), because the tape spans
  // the band's own width rather than a row slot.
  {
    const tapeGauge = GAUGES.find((g): g is TapeSpec => g.id === 'heading')!
    const stripW = TAPE_W * (360 / tapeGauge.windowSpan)
    const upperCentreY = (PANEL_BANDS.upper.top + PANEL_BANDS.upper.bottom) / 2
    const tapeY = PANEL_BELOW_M - upperCentreY

    // The rose, drawn THREE copies end to end (copy in [-1, 0, 1]). Sliding
    // within the middle copy then always has a neighbour rendered on both
    // sides, so crossing north (359 -> 001) never exposes bare space at the
    // edge of the visible window or leaps the strip's whole width.
    const strip = new Group()
    strip.name = 'tape:strip'
    for (const copy of [-1, 0, 1]) {
      for (const mark of tickMarksFor(tapeGauge)) {
        const x = (mark.fraction + copy) * stripW - stripW / 2
        const tick = new Mesh(
          new PlaneGeometry(0.002, mark.major ? 0.010 : 0.006),
          new MeshBasicMaterial({ color: 0xe6ecf5 }),
        )
        tick.position.set(x, 0.006, Z_MARKS)
        strip.add(tick)
        if (mark.major) {
          const numeral = textPlate(mark.text, 0.022, 0.011, makeText)
          numeral.position.set(x, -0.006, Z_MARKS)
          strip.add(numeral)
        }
      }
    }
    strip.position.set(0, tapeY, 0)
    root.add(strip)

    // The fixed index and the digital readout are children of ROOT, not of
    // `strip` -- if either were parented to the strip they would slide with
    // it, and an index that moves with the heading it is meant to point at
    // is not an index.
    const index = new Mesh(
      new PlaneGeometry(0.0025, 0.016),
      new MeshBasicMaterial({ color: 0xffd24a }),
    )
    index.name = 'tape:index'
    index.position.set(0, tapeY - 0.001, Z_NEEDLE)
    root.add(index)

    const tapeReadout = textPlate('', 0.05, 0.020, makeText)
    tapeReadout.name = 'tape:readout'
    tapeReadout.position.set(0, tapeY - 0.028, Z_READOUT)
    root.add(tapeReadout)

    tape = { strip, readout: tapeReadout }
  }

  // Positioned in the SAME body frame the cockpit group is posed in (sim
  // convention, +X forward, +Y up, +Z right -- see src/render/frame.ts's
  // `render` field doc: an Object3D, unlike a Three camera, has no hardcoded
  // "forward", so this needs no basis fix, only the eye-relative offset
  // below). Ahead of and below the EYE, not the airframe origin -- an
  // earlier draft used a fixed airframe-relative offset that put the panel
  // 0.65 m behind the F6F eye point, which a loose test tolerance missed.
  //
  // The dial faces are built in the CircleGeometry default plane, normal
  // +Z. The panel sits ahead of the eye in +X, so the pilot (at smaller X)
  // needs the faces turned to look back down -X: rotating -pi/2 about Y
  // sends +Z to -X -- verified numerically 2026-09-13 with three.js's own
  // Quaternion.applyQuaternion: (0,0,1) -> (-1,0,~0), (1,0,0) -> (~0,0,1).
  const [ex, ey, ez] = spec.view.eyePointM
  root.position.set(ex + PANEL_AHEAD_M, ey - PANEL_BELOW_M, ez)
  root.rotation.y = -Math.PI / 2
  return { root, needles, readouts, columns, horizon, reticle, backing, tape: tape! }
}

export function updatePanel(
  panel: Panel,
  spec: AircraftSpec,
  state: AircraftState,
  /**
   * The pilot's control inputs, for the one gauge (`throttle`) that reads
   * `Controls` rather than `AircraftState` (state.ts:8). Required, 4th, ahead
   * of `makeText` -- controller ruling R3, 2026-09-15: a defaulted vector
   * would let a caller forget to thread it and get a plausible-looking "0%
   * throttle" instead of a compile error, the same wired-vs-unwired failure
   * mode `tests/render/frameAssists.test.ts` exists to catch. Callers with
   * nothing to report pass the shared `NEUTRAL_CONTROLS` fixture explicitly
   * (tests/render/panel.test.ts).
   */
  controls: Controls,
  makeText: TextTextureFactory = makeTextTexture,
  /**
   * The attitude to lay the horizon bar against, when it differs from the
   * simulated one.
   *
   * The camera and the airframe are posed from the INTERPOLATED tick, the
   * numeric gauges from the simulated one. Until 2026-09-13 the bar took the
   * simulated attitude too, so at 80 deg/s of roll it led the visible horizon
   * by up to a third of a tick -- 1.33 degrees of sawtooth against the one
   * thing it exists to agree with, worst on a display faster than the 60 Hz
   * sim. The numbers on the dials are unaffected: nothing on screen contradicts
   * them, so reading them a fraction of a tick early is invisible.
   */
  renderAttitude: AircraftState['attitude'] = state.attitude,
): void {
  for (const g of GAUGES) {
    const readout = panel.readouts.get(g.id)
    if (readout) {
      const text = readoutTextFor(g.id, spec, state, controls)
      // Re-rasterise only on a real change. Measured over 600 ticks of the
      // real flight model: about 0.07 redraws per frame in gentle flight but
      // 1.44 per frame under active manoeuvring, driven mostly by the climb
      // gauge's single decimal place. So this saves roughly three quarters of
      // the work rather than almost all of it -- "a few times a second", which
      // this comment used to claim, was wrong by more than an order of
      // magnitude under exactly the conditions the panel is read in.
      if (text !== readout.text) {
        setPlateText(readout.mesh, text, makeText)
        readout.text = text
      }
    }
    const column = panel.columns.get(g.id)
    if (column) {
      // `gaugeValue`/`fractionForValue`, not `needleAngleFor`: a column has
      // no angle, and `throttle` is the one gauge that reads `controls`
      // rather than `state` (gauges.ts's `NEUTRAL_CONTROLS` doc comment).
      const value = gaugeValue(g.id, spec, state, controls)
      column.fill.scale.y = Math.max(1e-4, fractionForValue(g, value))
    }
    const needle = panel.needles.get(g.id)
    if (!needle) continue
    const angle = needleAngleFor(g.id, spec, state)
    // Negative: needle angles are clockwise from the dial's zero (gauges.ts),
    // and a positive rotation about +Z in this frame is anticlockwise.
    needle.rotation.z = -angle
  }

  // The heading tape: slide the rose under the fixed index, and print the
  // digits on the fixed readout. Not reached through `panel.readouts` above
  // -- `heading` is a `TapeSpec`, not a dial, so `createPanel` never put it
  // in that map (it filters to `kind === 'dial'`).
  {
    const tapeGauge = GAUGES.find((g): g is TapeSpec => g.id === 'heading')!
    const stripW = TAPE_W * (360 / tapeGauge.windowSpan)
    const headingDeg = gaugeValue('heading', spec, state, controls)
    panel.tape.strip.position.x = -tapeOffsetFor(tapeGauge, headingDeg) * stripW
    // Cached on `userData`, the same "only on a real change" saving the
    // dial readouts get from `panel.readouts`' own `Readout.text` field --
    // `Panel.tape.readout` is a bare `Mesh` (the interface this task was
    // handed), so there is no sibling wrapper to hold the last string.
    const text = readoutTextFor('heading', spec, state, controls)
    if (panel.tape.readout.userData.text !== text) {
      setPlateText(panel.tape.readout, text, makeText)
      panel.tape.readout.userData.text = text
    }
  }
  const { rollRad, pitchRad } = attitudeAngles({ ...state, attitude: renderAttitude })
  // A real artificial horizon stays level with the WORLD, so the bar must sit
  // at the angle the true horizon appears at in the pilot's view -- which is
  // NOT the same as "rotate the bar opposite the aircraft's roll number".
  //
  // This frame's +Z points back at the pilot (the panel root is turned -pi/2
  // about Y, sending local +Z to body -X), so a POSITIVE rotation.z is
  // anticlockwise on screen; and in a right bank the true horizon appears
  // rotated anticlockwise. Both signs therefore go the same way, and
  // `rotation.z = rollRad` is what makes the bar match the horizon rather
  // than mirror it.
  //
  // Measured 2026-09-13 with this project's own createPanel/updatePanel/
  // cameraTransformFor/toThreeOrientation, posed as main.ts poses them: at a
  // 30-degree right bank the bar now reads +30.00 degrees (+ = right end up)
  // against a true horizon of +30.00; the previous `-rollRad` read -30.00, a
  // 60-degree error that scaled with bank. tests/render/panel.test.ts pins
  // this against the camera-space projection of world-up, computed
  // independently of this line -- the old test asserted `-rollRad` and so
  // defended the bug through fifteen task reviews.
  panel.horizon.rotation.z = rollRad

  // Where the bar SITS, which nothing checked until 2026-09-13. C-1 and C-2
  // both corrected its angle; its height was a fixed panel offset plus
  // `pitchRad * 0.08`, an invented scale, so at zero pitch it hung 15.8
  // degrees below the eye line and read as a permanent nose-up error against
  // the visible horizon in level flight.
  //
  // It is now placed by geometry with no tuned constant at all. The bar's
  // datum, `PANEL_BELOW_M` in this frame, is exactly eye height. The true
  // horizon is depressed below the nose by the pitch angle, so at
  // `PANEL_AHEAD_M` ahead it lies `PANEL_AHEAD_M * tan(pitch)` lower -- and
  // that offset runs PERPENDICULAR TO THE BAR, along the projected world up,
  // not along the panel's own up, which is why it is rotated by roll too.
  // Offsetting along panel up instead would be right at zero bank and wrong
  // everywhere else, the same shape of error as C-2.
  //
  // Clamped only to keep `tan` finite near the vertical; at that pitch the
  // horizon is far off screen and its exact position stops mattering.
  const clampedPitch = Math.max(-MAX_HORIZON_PITCH, Math.min(MAX_HORIZON_PITCH, pitchRad))
  const drop = HORIZON_DISTANCE_M * Math.tan(clampedPitch)
  panel.horizon.position.set(
    drop * Math.sin(rollRad),
    PANEL_BELOW_M - drop * Math.cos(rollRad),
    HORIZON_Z,
  )
}
