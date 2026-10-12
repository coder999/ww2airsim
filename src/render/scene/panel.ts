import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
  type Texture,
} from 'three'
import {
  gaugesFor,
  fuelFraction,
  needleAngleFor,
  attitudeAngles,
  tickMarksFor,
  labelTextFor,
  readoutTextFor,
  gaugeValue,
  fractionForValue,
  tapeOffsetFor,
  angleForValue,
  type GaugeId,
  type Wind,
  type DialSpec,
  type ColumnSpec,
  type TapeSpec,
} from '../gauges.js'
import { makeTextTexture, type TextTextureFactory } from './text.js'
import {
  DIAL_GAP,
  INSTRUMENT_SCALE as S,
  DIAL_RADIUS,
  PANEL_AHEAD_M,
  PANEL_BANDS,
  PANEL_SLOTS,
  metresBelowEye,
} from './panelLayout.js'
import { CAMERA_VFOV_DEG } from '../camera.js'
import { gearDisplay, flapDisplay } from '../flightData.js'
import type { AircraftState, Controls } from '../../sim/flight/state.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { AircraftCombat } from '../../sim/weapons/combat.js'
import { gunHarmonization } from '../../sim/weapons/harmonization.js'
import { cockpitFor, type CockpitConfig } from './cockpitLayouts.js'

export type Panel = {
  readonly config: CockpitConfig
  readonly root: Object3D
  /** The reflector gunsight's reticle, depressed below the eye's boresight
   *  by the guns' harmonization angle (`gunHarmonization`): it marks where
   *  the rounds pass at convergence range, not where the eye looks. */
  readonly reticle: Object3D
  readonly needles: Map<GaugeId, Object3D>
  /** One RPM needle per physical engine. Multi-engine aircraft put each one
   *  on its own small face instead of stacking colored pointers on one dial. */
  readonly rpmNeedles: readonly Object3D[]
  /** The digital readout plate inside each dial, and the string it currently
   *  shows -- kept so `updatePanel` can skip re-rasterising an unchanged one. */
  readonly readouts: Map<GaugeId, Readout>
  /** Throttle and fuel bars, filled upward from their fixed bases. */
  readonly columns: Map<GaugeId, { readonly fill: Object3D }>
  /**
   * The artificial-horizon ball in the `attitude` slot (Task 6, 2026-09-15),
   * immediately to the right of the central radar reservation.
   *
   * Not a `GAUGES` entry (controller ruling R1): it is panel geometry driven
   * by `attitudeAngles(state)`. It replaced the horizon bar -- a cyan strip
   * floating at eye level, positioned in 3D to trace the true horizon exactly
   * -- which Task 7 (2026-09-15) then retired once this ball carried
   * equivalent test coverage. Unlike the bar, the ball is a panel-mounted
   * instrument like every other dial in the row: its BANK reading still
   * matches the true horizon's screen angle exactly (verified below), but its
   * PITCH reading is a scaled dial-face deflection (`attitudeBallGeometry`'s
   * own doc comment has the derivation), not a literal projection of where
   * the true horizon falls on screen -- the bar's own height-matching
   * property does not carry over, by design, the same way a real panel
   * attitude indicator does not track pixel-for-pixel with the windscreen.
   *
   * `ball` is a `Group` of two meshes (sky, ground) whose GEOMETRY
   * `updatePanel` rebuilds every frame as circular segments of a circle of
   * radius `DIAL_RADIUS`, cut by the horizon chord at the current roll and
   * pitch (`attitudeBallGeometry`, this file) -- there is no per-frame
   * `rotation`/`position` change on the group itself; it stays at local
   * identity forever. `ring` is the dial-style bezel ring drawn in front of
   * it, purely decorative: fix round 1 (2026-09-15) found nothing in this
   * renderer actually clips anything (no `clippingPlanes`, no stencil), so
   * the ball's geometry is now built to never exceed `DIAL_RADIUS` in the
   * first place -- `ring` no longer does any clipping work of its own.
   */
  readonly attitude: {
    readonly ball: Object3D
    readonly ring: Object3D
    readonly faceRadius: number
  }
  /** The radar scope's physical face mesh (Plan 17). `createPanel` gives it
   *  a plain, headless-safe fallback material (matching the old placeholder
   *  color) so Deterministic's `createPanel(f6f, () => null)` keeps working with
   *  no GPU or canvas; the browser-only `radarScope.attachTo` (main.ts)
   *  replaces it with the live scope texture at startup, the same
   *  construction-vs-browser-enhancement split `TextTextureFactory`
   *  already establishes for text. */
  readonly radar: { readonly face: Object3D; readonly faceRadius: number }
  /** The trapezoidal coaming plate. Runs past the bottom of the frame on
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
  /**
   * Gear and flap indicator lights (Mark, 2026-09-17: "flaps and landing gear
   * should somehow be indicated in the cockpit instruments"). The cockpit
   * design reserved indicator lights for these; they sit in the upper band
   * to the left of the heading tape, where the band has room and the lower
   * row does not. Three colours, driven by the SAME three states the
   * follow-view strip prints (`gearDisplay`/`flapDisplay`): dark up, amber
   * in transit, green down -- a real gear light's convention, and the reason
   * a pilot glances at it before the flare.
   */
  readonly lights: {
    readonly gear: Mesh
    readonly flap: Mesh
    readonly hook: Mesh
    readonly bay: Mesh
  }
  /** Remaining pilot-operated ammunition and stores. Unsupported store
   *  classes display an em dash so the four-cell bank never reflows. */
  readonly armament: ReadonlyMap<ArmamentId, Readout>
  /** Small family identifier embedded in unused fascia space. */
  readonly badge: Object3D
}

/** Indicator light colours. Exported so the test asserts the state each one
 *  means rather than a hex it would have to copy. */
export const LIGHT_OFF = 0x1a1f24
export const LIGHT_TRANSIT = 0xffb020
export const LIGHT_DOWN = 0x3ddc84
/** Red is deliberately not a system/category colour. It is reserved for a
 * genuine unsafe or failed state once the simulation exposes one. */
export const LIGHT_WARNING = 0xd7352f
/** The concept-approved two-row equipment bank: status lamps on top,
 *  armament counts below. It is one inset dashboard component, never a set
 *  of lights perched on the coaming edge. */
const EQUIPMENT_BANK_X = -0.270
const EQUIPMENT_BANK_Y = 0.065
const EQUIPMENT_BANK_W = 0.170
const EQUIPMENT_BANK_H = 0.064
const EQUIPMENT_CELL_W = EQUIPMENT_BANK_W / 4
const EQUIPMENT_CELL_X = (i: number): number =>
  EQUIPMENT_BANK_X - EQUIPMENT_BANK_W / 2 + EQUIPMENT_CELL_W * (i + 0.5)
export type ArmamentId = 'ammo' | 'bomb' | 'rocket' | 'torpedo'
const ARMAMENT_IDS: readonly ArmamentId[] = ['ammo', 'bomb', 'rocket', 'torpedo']

const APPROVED_FASCIA_ASPECT = 1672 / 941
const APPROVED_FASCIA_FAMILIES = new Set<CockpitConfig['layout']['id']>([
  'american-fighter',
  'american-bomber',
  'japanese-fighter',
  'japanese-bomber',
])

/**
 * The approved US-fighter checkpoint is the literal fascia source, not a
 * loose procedural re-interpretation. It supplies the silhouette, painted
 * metal, recessed housings, fasteners, and USN marking. Live meshes remain
 * above it for every value that can change in flight.
 *
 * Loading stays a browser enhancement like text and radar textures: headless
 * construction/tests never need an Image implementation or network access.
 */
function makeApprovedFascia(family: CockpitConfig['layout']['id']): Mesh | null {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null

  const material = new MeshBasicMaterial({ transparent: true, opacity: 0, alphaTest: 0.02 })
  const path = `${import.meta.env.BASE_URL}content/cockpit/${family}-fascia.png`
  new TextureLoader().load(path, (texture) => {
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false
    material.map = texture
    material.opacity = 1
    material.needsUpdate = true
  })

  const viewHeight = 2 * Math.tan((CAMERA_VFOV_DEG * Math.PI) / 360) * PANEL_AHEAD_M
  const fascia = new Mesh(
    new PlaneGeometry(viewHeight * APPROVED_FASCIA_ASPECT, viewHeight),
    material,
  )
  fascia.name = 'panel:approved-fascia'
  // Give the live masks real depth separation. Keeping this almost coplanar
  // with them lets the transparent fascia win depth ties on some WebGPU
  // drivers, which re-exposes the powered-off placeholder readings.
  fascia.position.set(0, PANEL_BELOW_M, BACKING_Z - 0.001)
  return fascia
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
 * and this plan exists to let a human judge how the airplane flies. What is
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
 * How far the readout (above) and label (below) sit from the dial's own
 * centre. Was `0.088` for both until Ruling R12 (Task 6 fix round 3,
 * 2026-09-15): that left a 30 mm gap beyond the bezel's own outer radius
 * (`DIAL_RADIUS * 1.09` = 0.0654 m) on each side -- far more than either
 * plate needs -- which is what forced `LOWER_H` (panelLayout.ts) to be wide
 * enough to eat into the vertical frustum margin (down to 0.36 degrees,
 * against the 1-degree minimum Ruling R4 already set for the horizontal
 * axis). Narrowed to reclaim that slack from the dial's own layout instead
 * of the frame: see `LOWER_H`'s own doc comment in panelLayout.ts for the
 * joint derivation of this constant and that one.
 */
const DIAL_TEXT_OFFSET_M = 0.08 * S

// The approved raster fascia has deliberately larger openings for its two
// display instruments than the old procedural row did. The live layers used
// the procedural dial radius, leaving a dark crescent around both screens and
// making their slightly high placement obvious. These radii and the shared
// correction register the live displays to the literal openings in all four
// approved family fascias.
const APPROVED_ATTITUDE_FACE_RADIUS = DIAL_RADIUS * 1.24
const APPROVED_RADAR_FACE_RADIUS = 0.066
const APPROVED_DISPLAY_Y_OFFSET = -0.0045

/**
 * The attitude ball's sky/ground split, rebuilt fresh every `updatePanel`
 * call rather than moved as a rigid transform on an oversized mesh.
 *
 * Fix round 1 on Task 6 (2026-09-15): the brief called for "an oversized
 * disc, clipped by the bezel ring" moved with `ball.rotation.z`/
 * `ball.position.y`. Nothing in this renderer clips anything -- no
 * `clippingPlanes`, no stencil -- so the disc drew exactly as big as its
 * geometry, and at a 45-degree bank its corner reached 56 mm into the fuel
 * dial's own face. The per-slot containment test this fix adds
 * (`tests/render/panel.test.ts`) is what caught it; the whole-panel frustum
 * test could not, because it unions every instrument into one combined
 * envelope dominated by the throttle/armament edge blocks.
 *
 * This builds the sky and ground as actual circular SEGMENTS of a circle of
 * radius `DIAL_RADIUS` -- the same radius every dial's own face uses --  so
 * the ball can never draw outside that circle at any attitude, by
 * construction rather than by masking. A segment is the region of a disc on
 * one side of a chord, which is always convex (cutting a convex region with
 * a straight line always yields two convex pieces), so a fan triangulated
 * from one chord endpoint is always a valid, non-self-intersecting
 * triangulation -- `ShapeGeometry` does exactly that.
 *
 * The chord's placement reproduces the same visual result the brief's
 * rigid-body version would have produced, worked out from its own transform
 * order (rotate the shape by `rollRad`, THEN translate the rotated shape by
 * `position.y` in the UNROTATED parent frame): a point `Q` on the circle is
 * on the sky side iff `dot(Q, up) > d`, where `up = (-sin(rollRad),
 * cos(rollRad))` and `d = t * cos(rollRad)` for `t` the same
 * `-(pitchRad / (Math.PI / 6)) * DIAL_RADIUS * 0.8` the brief specified.
 * Clamped to `[-DIAL_RADIUS, DIAL_RADIUS]`: past that the whole face is
 * legitimately all sky or all ground -- a saturation at extreme attitudes,
 * not an edge running off the disc the way the unclipped version had.
 */
const ATTITUDE_BALL_SEGMENTS = 24

function attitudeBallGeometry(
  rollRad: number,
  pitchRad: number,
  r = DIAL_RADIUS,
): { readonly sky: BufferGeometry; readonly ground: BufferGeometry } {
  const t = -(pitchRad / (Math.PI / 6)) * r * 0.8
  const d = Math.max(-r, Math.min(r, t * Math.cos(rollRad)))
  const beta = Math.asin(d / r)
  const skyFrom = rollRad + beta
  const skyTo = rollRad + Math.PI - beta

  // A single chord-to-chord arc, `from` to `to`, as a filled convex polygon:
  // the straight edge closing the shape back from the last arc point to the
  // first IS the chord, which is exactly the boundary a circular segment
  // needs.
  const segment = (from: number, to: number): ShapeGeometry => {
    const shape = new Shape()
    shape.moveTo(r * Math.cos(from), r * Math.sin(from))
    for (let i = 1; i <= ATTITUDE_BALL_SEGMENTS; i++) {
      const a = from + ((to - from) * i) / ATTITUDE_BALL_SEGMENTS
      shape.lineTo(r * Math.cos(a), r * Math.sin(a))
    }
    return new ShapeGeometry(shape)
  }

  return { sky: segment(skyFrom, skyTo), ground: segment(skyTo, skyFrom + Math.PI * 2) }
}

/**
 * The heading tape's visible window, metres. Exported so tests can derive
 * the strip's own full-rose width (`TAPE_W * (360 / windowSpan)`) without
 * hardcoding it a second time -- gauges.ts's `tapeOffsetFor` reports the
 * offset as a FRACTION of that width, and `updatePanel` scales by it.
 */
export const TAPE_W = 0.30 * S

/**
 * Slack added to the `TAPE_W` culling window so a mark does not pop in or
 * out abruptly right at the visible edge (Ruling R8, review round 2,
 * 2026-09-15). Deliberately small next to `TAPE_W`.
 */
export const TAPE_CULL_MARGIN_M = 0.01 * S

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
/** The center dot's angular diameter, inside the gap. */
const RETICLE_DOT_DEG = 0.2
/** At -0.004, this is FARTHER from the pilot than the dial faces (z = 0) and
 *  the backing plate (`BACKING_Z` = -0.001), by this file's own "local +Z
 *  points at the pilot" convention -- not "in front of" either, which is
 *  what this comment used to claim back when it was framed around the
 *  now-retired horizon bar. That ordering turns out to be moot: the reticle
 *  spans only about 1.51 degrees either side of its own center, which sits
 *  0.28 degrees below the eye line (the harmonization depression, F6F), so
 *  it reaches about 1.8 degrees below the eye line; the backing plate starts
 *  about 3.00 degrees below it (`HORIZON_KEEP_DEG`,
 *  panelLayout.ts), so the two never share the same screen position and
 *  which one is nominally "in front" never gets exercised. `panel.test.ts`
 *  pins the sight's own screen position independently of this value, at
 *  every attitude. */
const RETICLE_Z = -0.004

/** The coaming: an opaque plate giving the dashboard a hard lower edge
 *  instead of reading as a strip with sky visible beneath it. */
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

function armamentValues(
  spec: AircraftSpec,
  combat: AircraftCombat | null,
): Readonly<Record<ArmamentId, string>> {
  const stores = spec.stores
  const rack = stores?.racks[0]
  const rackKind = rack === undefined ? undefined : stores?.types[rack.store]?.kind
  const hasBombs = rackKind === 'bomb'
  const hasTorpedoes = rackKind === 'torpedo'
  const hasRockets = (stores?.rails.length ?? 0) > 0
  const hasGuns = (spec.combat?.guns.length ?? 0) > 0
  return {
    ammo: hasGuns ? String(combat?.guns.reduce((sum, gun) => sum + gun.ammo, 0) ?? 0) : '—',
    bomb: hasBombs ? String(combat?.stores.bombs ?? 0) : '—',
    rocket: hasRockets ? String(combat?.stores.rockets ?? 0) : '—',
    torpedo: hasTorpedoes ? String(combat?.stores.bombs ?? 0) : '—',
  }
}

function starShape(points = 5, outer = 0.0115, inner = 0.005): Shape {
  const shape = new Shape()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + i * Math.PI / points
    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

/** Family badge, intentionally small and stylised rather than a claim that
 *  every real aircraft carried this exact dashboard plaque. */
function makeFamilyBadge(kind: CockpitConfig['layout']['badge']): Group {
  const badge = new Group()
  badge.name = `cockpit:badge:${kind}`
  if (kind === 'usn') {
    const navy = new MeshBasicMaterial({ color: 0x244f7b })
    const white = new MeshBasicMaterial({ color: 0xf1eee2 })
    const wing = new Mesh(new PlaneGeometry(0.054, 0.009), white)
    wing.position.z = Z_MARKS
    badge.add(wing)
    const disc = new Mesh(new CircleGeometry(0.018, 32), navy)
    disc.position.z = Z_MARKS + 0.0002
    badge.add(disc)
    const star = new Mesh(new ShapeGeometry(starShape()), white)
    star.position.z = Z_MARKS + 0.0004
    badge.add(star)
  } else {
    const red = new MeshBasicMaterial({ color: 0xb52b25 })
    const gold = new MeshBasicMaterial({ color: 0xc7a45a })
    const sun = new Mesh(new CircleGeometry(0.016, 32), red)
    sun.position.z = Z_MARKS
    badge.add(sun)
    const shank = new Mesh(new PlaneGeometry(0.0035, 0.028), gold)
    shank.position.z = Z_MARKS + 0.0002
    badge.add(shank)
    const stock = new Mesh(new PlaneGeometry(0.020, 0.0035), gold)
    stock.position.set(0, 0.0045, Z_MARKS + 0.0002)
    badge.add(stock)
    const crown = new Mesh(new RingGeometry(0.004, 0.006, 20), gold)
    crown.position.set(0, 0.0145, Z_MARKS + 0.0002)
    badge.add(crown)
    const arms = new Mesh(new RingGeometry(0.0085, 0.011, 24, 1, Math.PI, Math.PI), gold)
    arms.position.set(0, -0.010, Z_MARKS + 0.0002)
    badge.add(arms)
  }
  return badge
}

/** Small two-layer fastener used on the fascia and instrument sub-panels.
 * The slot is deliberately visible at normal cockpit distance: the approved
 * reference reads as assembled hardware, not a collection of flat UI cards. */
function makeScrew(radius = 0.0042, angle = Math.PI / 4): Group {
  const screw = new Group()
  const rim = new Mesh(
    new CircleGeometry(radius, 20),
    new MeshBasicMaterial({ color: 0x070b0e }),
  )
  rim.position.z = Z_MARKS
  screw.add(rim)
  const head = new Mesh(
    new CircleGeometry(radius * 0.72, 20),
    new MeshBasicMaterial({ color: 0x53636d }),
  )
  head.position.z = Z_MARKS + 0.0002
  screw.add(head)
  const slot = new Mesh(
    new PlaneGeometry(radius * 1.05, radius * 0.18),
    new MeshBasicMaterial({ color: 0x10171b }),
  )
  slot.rotation.z = angle
  slot.position.z = Z_MARKS + 0.0004
  screw.add(slot)
  return screw
}

function addScrew(parent: Group, x: number, y: number, z = 0, angle = Math.PI / 4, radius?: number): void {
  const screw = makeScrew(radius, angle)
  screw.position.set(x, y, z)
  parent.add(screw)
}

/** Browser-only brushed metal paint for the large fighter fascia. Geometry,
 * instruments, and hit-free transparent edges remain procedural meshes; this
 * texture supplies the subtle value variation a single flat hex colour cannot. */
function makeFasciaPaintTexture(family: CockpitConfig['layout']['id']): Texture | null {
  if (typeof document === 'undefined' || family !== 'american-fighter') return null
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 768
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const outline = new Path2D()
  outline.moveTo(0, h)
  outline.lineTo(0, h * 0.48)
  outline.quadraticCurveTo(w * 0.02, h * 0.34, w * 0.14, h * 0.23)
  outline.quadraticCurveTo(w * 0.25, h * 0.14, w * 0.36, h * 0.16)
  outline.lineTo(w * 0.40, h * 0.16)
  outline.quadraticCurveTo(w * 0.43, h * 0.16, w * 0.46, h * 0.035)
  outline.quadraticCurveTo(w * 0.47, 0, w * 0.50, 0)
  outline.quadraticCurveTo(w * 0.53, 0, w * 0.54, h * 0.035)
  outline.quadraticCurveTo(w * 0.57, h * 0.16, w * 0.60, h * 0.16)
  outline.lineTo(w * 0.64, h * 0.16)
  outline.quadraticCurveTo(w * 0.75, h * 0.14, w * 0.86, h * 0.23)
  outline.quadraticCurveTo(w * 0.98, h * 0.34, w, h * 0.48)
  outline.lineTo(w, h)
  outline.closePath()

  const metal = ctx.createLinearGradient(0, 0, 0, h)
  metal.addColorStop(0, '#2e414d')
  metal.addColorStop(0.18, '#1c303b')
  metal.addColorStop(0.52, '#122630')
  metal.addColorStop(1, '#071722')
  ctx.fillStyle = metal
  ctx.fill(outline)

  ctx.save()
  ctx.clip(outline)
  const crownGlow = ctx.createRadialGradient(w * 0.5, h * 0.02, 0, w * 0.5, h * 0.15, w * 0.42)
  crownGlow.addColorStop(0, 'rgba(145,174,190,0.23)')
  crownGlow.addColorStop(0.45, 'rgba(64,91,106,0.08)')
  crownGlow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = crownGlow
  ctx.fillRect(0, 0, w, h)

  // Fine deterministic brushing and a few broad, low-contrast wear streaks.
  ctx.globalAlpha = 0.055
  for (let y = 18; y < h; y += 11) {
    ctx.strokeStyle = y % 22 === 0 ? '#d6e0e5' : '#02090d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y + ((y / 11) % 3 - 1) * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.10
  for (const x of [0.12, 0.31, 0.68, 0.87]) {
    const sheen = ctx.createLinearGradient(w * (x - 0.07), 0, w * (x + 0.07), 0)
    sheen.addColorStop(0, 'rgba(255,255,255,0)')
    sheen.addColorStop(0.5, 'rgba(170,195,205,0.24)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(w * (x - 0.07), 0, w * 0.14, h)
  }
  ctx.restore()

  ctx.strokeStyle = '#050c11'
  ctx.lineWidth = 18
  ctx.stroke(outline)
  ctx.strokeStyle = '#536773'
  ctx.lineWidth = 7
  ctx.stroke(outline)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

function makeDialFaceTexture(faceColor: number): Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const edge = `#${faceColor.toString(16).padStart(6, '0')}`
  const glass = ctx.createRadialGradient(98, 78, 8, 128, 128, 126)
  glass.addColorStop(0, '#243038')
  glass.addColorStop(0.34, '#11191e')
  glass.addColorStop(0.72, edge)
  glass.addColorStop(1, '#010304')
  ctx.fillStyle = glass
  ctx.fillRect(0, 0, 256, 256)
  const reflection = ctx.createLinearGradient(0, 0, 0, 160)
  reflection.addColorStop(0, 'rgba(210,230,238,0.12)')
  reflection.addColorStop(0.58, 'rgba(120,155,170,0.025)')
  reflection.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = reflection
  ctx.beginPath()
  ctx.ellipse(100, 70, 104, 48, -0.22, 0, Math.PI * 2)
  ctx.fill()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

export function createPanel(spec: AircraftSpec, makeText: TextTextureFactory = makeTextTexture): Panel {
  const config = cockpitFor(spec)
  // C3 deliberately has four reusable cockpit families. Each now has an
  // approved, powered-off fascia at the same live-instrument coordinates.
  const approvedFascia = APPROVED_FASCIA_FAMILIES.has(config.layout.id)
  const gauges = gaugesFor(config.layout.unitProfile)
  const root = new Group()
  const needles = new Map<GaugeId, Object3D>()
  const readouts = new Map<GaugeId, Readout>()
  let tape: Panel['tape']
  let attitude: Panel['attitude']
  const armament = new Map<ArmamentId, Readout>()

  const faceTexture = makeDialFaceTexture(config.layout.faceColor)
  const faceMat = new MeshBasicMaterial({
    color: faceTexture === null ? config.layout.faceColor : 0xffffff,
    map: faceTexture,
  })
  const needleMat = new MeshBasicMaterial({ color: config.layout.needleColor })
  const bezelMat = new MeshBasicMaterial({ color: config.layout.bezelColor })
  const bezelShadowMat = new MeshBasicMaterial({ color: 0x070c0f })
  const bezelHighlightMat = new MeshBasicMaterial({ color: config.layout.trimColor })
  const markMajorMat = new MeshBasicMaterial({ color: config.layout.majorMarkColor })
  const markMinorMat = new MeshBasicMaterial({ color: config.layout.minorMarkColor })

  // Round dials only. A column or a tape is a different shape entirely --
  // giving one a needle and a bezel here is exactly the bug this filter
  // exists to prevent. The current row has three numeric dials and a ball;
  // columns, the radar reservation, and the tape are built separately below.
  const dialGauges = gauges.filter((g): g is DialSpec => g.kind === 'dial' && g.cockpit !== false)
  const rpmNeedles: Object3D[] = []

  // Layout slots are keyed by id (panelLayout.ts's PANEL_SLOTS), not by
  // position in this array -- the ball occupies its own slot, so a dial's
  // index here is not its index in the slot table.
  const slotX = (id: string): number => {
    if (id === 'rpm' || id === 'slip') return config.layout.auxiliaryX[id]
    const slot = PANEL_SLOTS.find((s) => s.id === id)
    if (!slot) throw new Error(`no layout slot for ${id}`)
    return slot.centreX
  }
  const lowerCentre = (PANEL_BANDS.lower.top + PANEL_BANDS.lower.bottom) / 2

  dialGauges.forEach((g) => {
    const dial = new Group()
    const x = slotX(g.id)
    const slot = PANEL_SLOTS.find((candidate) => candidate.id === g.id)!
    const band = PANEL_BANDS[slot.band ?? 'lower']
    const centre = (band.top + band.bottom) / 2

    if (g.id === 'rpm' && config.rpmNeedles > 1) {
      // One pointer per face. The previous implementation put two or four
      // differently colored pointers on the one photographed RPM scale; the
      // simulation was genuinely per-engine, but the presentation was not.
      // Keep the cluster inside the existing RPM opening so the four-family
      // fascia remains shared by single-, twin-, and four-engine aircraft.
      const fourUp = config.rpmNeedles > 2
      const faceRadius = DIAL_RADIUS * (fourUp ? 0.31 : 0.42)
      const centreOffsetX = DIAL_RADIUS * (fourUp ? 0.38 : 0.43)
      const centreOffsetY = fourUp ? DIAL_RADIUS * 0.38 : 0

      const mask = new Mesh(
        // Cover the photographed single-engine scale all the way to its inner
        // rim; otherwise its old 0/4 numerals show through around the new
        // engine faces and make the cluster look like one gauge laid over
        // another.
        new CircleGeometry(DIAL_RADIUS * 1.10, 48),
        new MeshBasicMaterial({ color: config.layout.faceColor }),
      )
      mask.position.z = Z_MARKS
      dial.add(mask)

      for (let i = 0; i < config.rpmNeedles; i++) {
        const subdial = new Group()
        subdial.name = `rpm-engine:${i + 1}`
        const column = fourUp ? i % 2 : i
        const row = fourUp ? Math.floor(i / 2) : 0
        subdial.position.set(
          (column === 0 ? -1 : 1) * centreOffsetX,
          fourUp ? (row === 0 ? 1 : -1) * centreOffsetY : 0,
          0,
        )

        const face = new Mesh(new CircleGeometry(faceRadius, 32), faceMat)
        face.position.z = Z_MARKS + 0.0002
        subdial.add(face)
        const rim = new Mesh(
          new RingGeometry(faceRadius, faceRadius * 1.12, 32),
          bezelHighlightMat,
        )
        rim.position.z = Z_MARKS + 0.0004
        subdial.add(rim)

        for (const mark of tickMarksFor(g).filter((candidate) => candidate.major)) {
          const len = faceRadius * 0.18
          const tick = new Mesh(
            new BoxGeometry(Math.max(0.0011, faceRadius * 0.085), len, 0.002),
            markMajorMat,
          )
          const tickRadius = faceRadius - len / 2 - faceRadius * 0.06
          tick.position.set(
            tickRadius * Math.sin(mark.angleRad),
            tickRadius * Math.cos(mark.angleRad),
            Z_MARKS + 0.0006,
          )
          tick.rotation.z = -mark.angleRad
          subdial.add(tick)
        }

        const needle = new Mesh(
          new BoxGeometry(Math.max(0.0014, faceRadius * 0.11), faceRadius * 1.08, 0.003),
          needleMat,
        )
        needle.geometry.translate(0, faceRadius * 0.44, 0)
        needle.position.z = Z_NEEDLE + i * 0.0002
        needle.userData.engineIndex = i
        subdial.add(needle)
        rpmNeedles.push(needle)

        const hub = new Mesh(
          new CircleGeometry(Math.max(0.0017, faceRadius * 0.13), 16),
          new MeshBasicMaterial({ color: 0xd8a72f }),
        )
        hub.position.z = Z_NEEDLE + 0.0005
        subdial.add(hub)

        const engineNumber = textPlate(String(i + 1), faceRadius * 0.68, faceRadius * 0.46, makeText)
        engineNumber.position.set(0, -faceRadius * 0.53, Z_READOUT)
        subdial.add(engineNumber)
        dial.add(subdial)
      }

      needles.set(g.id, rpmNeedles[0]!)
      const readoutMesh = textPlate('', DIAL_RADIUS, 0.022 * S, makeText)
      readoutMesh.visible = false
      dial.add(readoutMesh)
      readouts.set(g.id, { mesh: readoutMesh, text: '' })
      dial.name = 'dial:rpm'
      dial.scale.setScalar(config.layout.auxiliaryScale)
      dial.position.set(x, PANEL_BELOW_M - centre, 0)
      root.add(dial)
      return
    }

    const outerShadow = new Mesh(
      new RingGeometry(DIAL_RADIUS * 1.09, DIAL_RADIUS * 1.18, 48),
      bezelShadowMat,
    )
    outerShadow.position.z = Z_MARKS * 0.18
    outerShadow.visible = !approvedFascia
    dial.add(outerShadow)
    const raisedLip = new Mesh(
      new RingGeometry(DIAL_RADIUS * 1.055, DIAL_RADIUS * 1.11, 48),
      bezelHighlightMat,
    )
    raisedLip.position.z = Z_MARKS * 0.42
    raisedLip.visible = !approvedFascia
    dial.add(raisedLip)

    const face = new Mesh(new CircleGeometry(DIAL_RADIUS, 48), faceMat)
    if (approvedFascia) face.layers.set(1)
    dial.add(face)

    // A layered bezel, so the instrument reads as seated in the fascia rather
    // than as a circle painted on top of it.
    const bezel = new Mesh(new RingGeometry(DIAL_RADIUS, DIAL_RADIUS * 1.065, 48), bezelMat)
    bezel.position.z = Z_MARKS
    bezel.visible = !approvedFascia
    dial.add(bezel)

    // Scale marks. Without these the dial had no zero, which made
    // needleAngleFor's documented "clockwise from the dial's zero" a
    // reference to something that did not exist (whole-branch review, I-2).
    for (const mark of tickMarksFor(g)) {
      const len = DIAL_RADIUS * (mark.major ? 0.18 : 0.10)
      const tick = new Mesh(
        new BoxGeometry((mark.major ? 0.005 : 0.0025) * S, len, 0.002),
        mark.major ? markMajorMat : markMinorMat,
      )
      // Marks sit just inside the rim, and the whole tick is rotated about
      // the dial centre by the SAME angle the needle uses for that value --
      // `tickMarksFor` and `needleAngleFor` both call `angleForValue`, so a
      // needle cannot point between its own marks.
      const r = DIAL_RADIUS - len / 2 - 0.004 * S
      const a = mark.angleRad
      tick.position.set(r * Math.sin(a), r * Math.cos(a), Z_MARKS)
      tick.rotation.z = -a
      tick.visible = g.id !== 'slip'
      if (approvedFascia) tick.layers.set(1)
      dial.add(tick)

      if (mark.major && mark.text) {
        const markText = g.id === 'rpm' ? String(Number(mark.text) / 1000) : mark.text
        const numeral = textPlate(markText, DIAL_RADIUS * 0.36, DIAL_RADIUS * 0.17, makeText)
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
        numeral.visible = g.id !== 'slip'
        if (approvedFascia) numeral.layers.set(1)
        dial.add(numeral)
      }
    }

    const needle = new Mesh(
      g.id === 'slip'
        ? new BoxGeometry(0.004 * S, 0.020 * S, 0.004)
        : new BoxGeometry(0.006 * S, DIAL_RADIUS * 1.1, 0.004),
      needleMat,
    )
    // Offset ordinary pointers so they pivot about the dial centre. The slip
    // marker instead translates along its horizontal tube in updatePanel.
    if (g.id !== 'slip') needle.geometry.translate(0, DIAL_RADIUS * 0.45, 0)
    needle.position.z = Z_NEEDLE
    dial.add(needle)
    if (g.id === 'slip') {
      const tube = new Mesh(
        new PlaneGeometry(DIAL_RADIUS * 1.35, 0.012 * S),
        new MeshBasicMaterial({ color: 0x8d9ba1 }),
      )
      tube.position.z = Z_MARKS + 0.0005
      if (approvedFascia) tube.layers.set(1)
      dial.add(tube)
      const tubeCore = new Mesh(
        new PlaneGeometry(DIAL_RADIUS * 1.18, 0.006 * S),
        new MeshBasicMaterial({ color: 0x172027 }),
      )
      tubeCore.position.z = Z_MARKS + 0.0008
      if (approvedFascia) tubeCore.layers.set(1)
      dial.add(tubeCore)
      const sideLabels = config.layout.unitProfile === 'metric-japanese' ? ['左', '右'] : ['L', 'R']
      for (const [i, side] of sideLabels.entries()) {
        const plate = textPlate(side, 0.014, 0.012, makeText)
        plate.position.set((i === 0 ? -1 : 1) * DIAL_RADIUS * 0.58, DIAL_RADIUS * 0.43, Z_READOUT)
        if (approvedFascia) plate.layers.set(1)
        dial.add(plate)
      }
    } else {
      const hub = new Mesh(
        new CircleGeometry(0.0055 * S, 20),
        new MeshBasicMaterial({ color: 0xd8a72f }),
      )
      hub.position.z = Z_NEEDLE + 0.0004
      dial.add(hub)
    }
    needles.set(g.id, needle)
    if (g.id === 'rpm') {
      rpmNeedles.push(needle)
      for (let i = 1; i < config.rpmNeedles; i++) {
        const extra = new Mesh(
          new BoxGeometry(0.0035 * S, DIAL_RADIUS * 1.05, 0.003),
          new MeshBasicMaterial({ color: i % 2 === 0 ? 0x7fc8ff : 0xff8f70 }),
        )
        extra.geometry.translate(0, DIAL_RADIUS * 0.43, 0)
        extra.position.z = Z_NEEDLE + i * 0.0003
        extra.userData.engineIndex = i
        dial.add(extra)
        rpmNeedles.push(extra)
      }
    }

    // The name and unit, which GAUGES has carried since Task 10 with nothing
    // rendering them -- zero non-definition hits across src, tests and tools
    // before this (whole-branch review, I-2).
    const dialLabel = g.id === 'rpm'
      ? config.layout.unitProfile === 'metric-japanese' ? '回転  ×1000' : 'RPM  ×1000'
      : labelTextFor(g)
    const label = textPlate(dialLabel, DIAL_GAP * 0.79, 0.024 * S, makeText)
    label.position.set(0, -DIAL_TEXT_OFFSET_M, Z_MARKS)
    if (approvedFascia) label.layers.set(1)
    dial.add(label)

    // Digital readout, ABOVE the dial rather than inside it. Inside, it
    // collided with the scale numerals along the bottom of the face -- the
    // altimeter's "605" was drawn across its own 8000 and 6000 marks. A
    // three-quarter sweep covers the bottom of the dial, so there is no clear
    // window down there to put it in. Per design spec section 7's "digital
    // readouts alongside needles where that helps". It helps most for altitude and heading, where
    // reading a needle to better than a few hundred metres or a few degrees is
    // exactly what the oversized-dial trade gave up.
    const readoutMesh = textPlate('', DIAL_RADIUS * 1.15, 0.022 * S, makeText)
    readoutMesh.position.set(0, DIAL_TEXT_OFFSET_M, Z_READOUT)
    // The approved face uses the analogue scale itself; floating digital
    // values above every dial were prototype scaffolding and visually broke
    // the recessed instrument bays. Keep the live text cached for telemetry
    // and tests without painting it over the fascia.
    readoutMesh.visible = false
    dial.add(readoutMesh)
    readouts.set(g.id, { mesh: readoutMesh, text: '' })

    dial.name = `dial:${g.id}`
    // Slip and RPM now read as real instruments, not indicator dots. Their
    // complete faces are roughly four-fifths main-dial size and sit just
    // below the compass line, clear of both the tape and annunciator banks.
    if (slot.band === 'auxiliary') dial.scale.setScalar(config.layout.auxiliaryScale)
    dial.position.set(x, PANEL_BELOW_M - centre, 0)
    root.add(dial)
  })
  // Live as of Plan 17: no longer a claim-without-backing placeholder (the
  // design spec's §5 "unlit bezel reads as broken" reasoning, now in
  // reverse -- a "RESERVED" label on a working instrument would be the same
  // lie the other direction). No on-face label, matching the attitude
  // ball's precedent: a live, self-evidently-a-radar sweep needs none.
  const radarFaceRadius = approvedFascia ? APPROVED_RADAR_FACE_RADIUS : 0.058
  const radar = new Group()
  radar.name = 'radar'
  radar.position.set(
    slotX('radar'),
    PANEL_BELOW_M - lowerCentre + (approvedFascia ? APPROVED_DISPLAY_Y_OFFSET : 0),
    0,
  )
  const radarShadow = new Mesh(new PlaneGeometry(0.152, 0.140), bezelShadowMat)
  radarShadow.position.z = Z_MARKS * 0.12
    radarShadow.visible = !approvedFascia
  radar.add(radarShadow)
  const radarTrim = new Mesh(new PlaneGeometry(0.144, 0.132), bezelHighlightMat)
  radarTrim.position.z = Z_MARKS * 0.28
    radarTrim.visible = !approvedFascia
  radar.add(radarTrim)
  const radarBezel = new Mesh(new PlaneGeometry(0.136, 0.124), bezelMat)
  radarBezel.position.z = Z_MARKS * 0.42
    radarBezel.visible = !approvedFascia
  radar.add(radarBezel)
  const radarFace = new Mesh(
    approvedFascia ? new CircleGeometry(radarFaceRadius, 48) : new PlaneGeometry(0.131, 0.111),
    new MeshBasicMaterial({ color: 0x101c17 }),
  )
  radarFace.position.z = Z_MARKS
  radar.add(radarFace)
  const radarRing = new Mesh(new RingGeometry(radarFaceRadius, 0.066, 48), bezelShadowMat)
  radarRing.position.z = Z_MARKS + 0.0004
  radarRing.visible = !approvedFascia
  radar.add(radarRing)
  root.add(radar)

  // Column gauges: a vertical light bar, not a needle -- Mark asked for this
  // throttle after pressing the key and seeing nothing on the panel move.
  // Fuel uses the same construction with five marks and capacity-based fill.
  const columnGauges = gauges.filter((g): g is ColumnSpec => g.kind === 'column')
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
  const COLUMN_BEZEL_T = 0.004 * S

  columnGauges.forEach((g) => {
    const slot = PANEL_SLOTS.find((s) => s.id === g.id)
    if (!slot) throw new Error(`no layout slot for ${g.id}`)
    const { centreX: x, widthM } = slot

    const column = new Group()

    // Bezel spans the slot's FULL width, matching it exactly rather than
    // overhanging it -- the brief's stop condition ("if anything you draw
    // would exceed the slot width, STOP") is met by construction: nothing
    // below is wider than this plate.
    const shadow = new Mesh(new PlaneGeometry(widthM + 0.012, columnH + 0.012), bezelShadowMat)
    shadow.position.z = Z_MARKS * 0.15
    shadow.visible = !approvedFascia
    column.add(shadow)
    const lip = new Mesh(new PlaneGeometry(widthM + 0.006, columnH + 0.006), bezelHighlightMat)
    lip.position.z = Z_MARKS * 0.35
    lip.visible = !approvedFascia
    column.add(lip)
    const bezel = new Mesh(new PlaneGeometry(widthM, columnH), bezelMat)
    bezel.position.z = Z_MARKS * 0.55
    bezel.visible = !approvedFascia
    column.add(bezel)

    const faceW = widthM - COLUMN_BEZEL_T * 2
    // Leave a title above the track without growing beyond the reserved band.
    const fullH = columnH - 0.028
    const face = new Mesh(new PlaneGeometry(faceW, fullH), faceMat)
    face.position.z = Z_MARKS / 2
    if (approvedFascia) face.layers.set(1)
    column.add(face)
    const japanese = config.layout.unitProfile === 'metric-japanese'
    const columnLabel = textPlate(
      japanese ? g.label : g.id === 'fuel' ? 'FUEL' : 'ENGINE',
      widthM * 0.9,
      0.010,
      makeText,
    )
    columnLabel.position.set(0, columnH / 2 - 0.006, Z_READOUT)
    columnLabel.visible = !approvedFascia
    column.add(columnLabel)

    // Ticks and numerals live in the left part of the face; the fill bar
    // occupies the right part, so a full-throttle bar never runs under its
    // own "100" numeral (brief step 3: "a fill plane on the right").
    const fillW = faceW * (approvedFascia ? 0.24 : 0.34)
    const tickZoneW = faceW - fillW
    const fillX = faceW / 2 - fillW / 2
    const tickLeftX = -faceW / 2

    // Nine throttle marks; five fuel marks with a longer halfway hash.
    for (const mark of tickMarksFor(g)) {
      const len = tickZoneW * (mark.major ? 0.62 : 0.36)
      const y = -fullH / 2 + mark.fraction * fullH
      const tick = new Mesh(
        new BoxGeometry(len, (mark.major ? 0.005 : 0.0025) * S, 0.002),
        mark.major ? markMajorMat : markMinorMat,
      )
      tick.position.set(tickLeftX + len / 2, y, Z_MARKS)
      tick.name = 'column:tick'
      tick.userData.fraction = mark.fraction
      if (approvedFascia) tick.layers.set(1)
      column.add(tick)

      if (mark.major && mark.text && (g.id !== 'fuel' || mark.fraction === 0 || mark.fraction === 0.5 || mark.fraction === 1)) {
        const text = g.id === 'fuel'
          ? japanese
            ? mark.fraction === 1 ? '満' : mark.fraction === 0.5 ? '半' : '空'
            : mark.fraction === 1 ? 'F' : mark.fraction === 0.5 ? '1/2' : 'E'
          : mark.text
        const numeral = textPlate(text, tickZoneW * 0.94, 0.018 * S, makeText)
        // Nudged inward from the very top/bottom edge so the 0 and 100
        // numerals do not print half off the top or bottom of the face.
        const ny = mark.fraction === 0 ? y + 0.011 * S : mark.fraction === 1 ? y - 0.011 * S : y
        numeral.position.set(tickLeftX + tickZoneW * 0.42, ny, Z_MARKS)
        if (approvedFascia) numeral.layers.set(1)
        column.add(numeral)
      }
    }

    const fill = new Mesh(
      new PlaneGeometry(fillW, fullH),
      new MeshBasicMaterial({ color: approvedFascia ? 0xe4d3a9 : 0xc8ccd2 }),
    )
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

  // Base width at the narrowest supported window. resizePanel expands only
  // this backing for wider viewports; instruments keep their physical size.
  const halfV = Math.tan(((CAMERA_VFOV_DEG / 2) * Math.PI) / 180)
  const backingHalfW = PANEL_MIN_ASPECT * halfV * PANEL_AHEAD_M * 1.27
  // Past the frame edge, not up to it (Task 3, 2026-09-15): this is the clip
  // that stops the panel reading as a strip floating in mid-screen with sky
  // visible below it. `panel.test.ts`'s "runs the bezel past the bottom of
  // the frame" pins this against the camera's own vertical half-angle.
  const backingBottom = metresBelowEye(CAMERA_VFOV_DEG / 2) * 1.15
  const backingTop = PANEL_BANDS.upper.top

  // Four deliberately different dashboard silhouettes. They share the same
  // readable instrument vocabulary, but not the 2026 draft's single grey
  // trapezoid with a slightly different crown width.
  const profile = (inset: number): Shape => {
    const topY = PANEL_BELOW_M - backingTop
    const shoulderY = PANEL_BELOW_M - 0.228
    const bottomY = PANEL_BELOW_M - backingBottom
    const inwardX = (x: number): number => x < 0 ? x + inset : x - inset
    const inwardY = (y: number, upper: boolean): number => y + (upper ? -inset : inset)
    if (config.layout.panelProfile === 'us-fighter-cowl') {
      const s = new Shape()
      const edge = backingHalfW - inset
      const bottom = bottomY + inset
      const shoulder = shoulderY + inset * 0.35
      const sideTop = 0.064 - inset
      const shelfTop = 0.086 - inset
      const crownTop = topY - inset
      s.moveTo(-edge, bottom)
      s.lineTo(-edge, shoulder)
      s.quadraticCurveTo(-edge * 0.98, 0.008, -edge * 0.84, sideTop)
      s.quadraticCurveTo(-edge * 0.70, shelfTop, -0.29 + inset, shelfTop)
      s.lineTo(-0.245 + inset, shelfTop)
      s.quadraticCurveTo(-0.205 + inset, shelfTop, -0.165 + inset, crownTop - 0.018)
      s.quadraticCurveTo(-0.145 + inset, crownTop, -0.105 + inset, crownTop)
      s.lineTo(0.105 - inset, crownTop)
      s.quadraticCurveTo(0.145 - inset, crownTop, 0.165 - inset, crownTop - 0.018)
      s.quadraticCurveTo(0.205 - inset, shelfTop, 0.245 - inset, shelfTop)
      s.lineTo(0.29 - inset, shelfTop)
      s.quadraticCurveTo(edge * 0.70, shelfTop, edge * 0.84, sideTop)
      s.quadraticCurveTo(edge * 0.98, 0.008, edge, shoulder)
      s.lineTo(edge, bottom)
      s.closePath()
      return s
    }
    let points: readonly (readonly [number, number, boolean])[]
    switch (config.layout.panelProfile) {
      case 'us-bomber-desk':
        points = [
          [-backingHalfW, bottomY, false], [-backingHalfW * 0.98, shoulderY, true],
          [-backingHalfW * 0.91, topY - 0.004, true], [backingHalfW * 0.91, topY - 0.004, true],
          [backingHalfW * 0.98, shoulderY, true], [backingHalfW, bottomY, false],
        ]
        break
      case 'jp-fighter-hood':
        points = [
          [-backingHalfW, bottomY, false], [-backingHalfW * 0.96, shoulderY, true],
          [-backingHalfW * 0.78, topY - 0.020, true], [-0.24, topY - 0.016, true],
          [-0.14, topY, true], [0.14, topY, true], [0.24, topY - 0.016, true],
          [backingHalfW * 0.78, topY - 0.020, true], [backingHalfW * 0.96, shoulderY, true],
          [backingHalfW, bottomY, false],
        ]
        break
      case 'jp-bomber-twin':
        points = [
          [-backingHalfW, bottomY, false], [-backingHalfW * 0.97, shoulderY, true],
          [-backingHalfW * 0.82, topY - 0.018, true], [-0.35, topY - 0.004, true],
          [-0.13, topY - 0.004, true], [-0.08, topY - 0.020, true],
          [0.08, topY - 0.020, true], [0.13, topY - 0.004, true],
          [0.35, topY - 0.004, true], [backingHalfW * 0.82, topY - 0.018, true],
          [backingHalfW * 0.97, shoulderY, true], [backingHalfW, bottomY, false],
        ]
        break
    }
    const shape = new Shape()
    points.forEach(([x, y, upper], i) => {
      const px = inwardX(x)
      const py = inwardY(y, upper)
      if (i === 0) shape.moveTo(px, py)
      else shape.lineTo(px, py)
    })
    shape.closePath()
    return shape
  }
  const outline = profile(0)
  const fascia = profile(0.004)
  outline.holes.push(fascia)
  const backing = new Mesh(new ShapeGeometry([outline, fascia]), [
    new MeshBasicMaterial({ color: config.layout.rimColor }),
    new MeshBasicMaterial({ color: config.layout.fasciaColor }),
  ])
  backing.name = 'backing'
  backing.position.set(0, 0, BACKING_Z)
  if (approvedFascia) backing.layers.set(1)
  root.add(backing)
  const approvedFasciaMesh = approvedFascia ? makeApprovedFascia(config.layout.id) : null
  if (approvedFasciaMesh !== null) root.add(approvedFasciaMesh)
  const fasciaPaintTexture = approvedFascia ? null : makeFasciaPaintTexture(config.layout.id)
  if (fasciaPaintTexture !== null) {
    const paintTop = PANEL_BELOW_M - backingTop
    const paintBottom = PANEL_BELOW_M - backingBottom
    const paint = new Mesh(
      new PlaneGeometry(backingHalfW * 2, paintTop - paintBottom),
      new MeshBasicMaterial({ map: fasciaPaintTexture, transparent: true }),
    )
    paint.name = 'panel:fascia-paint'
    paint.position.set(0, (paintTop + paintBottom) / 2, BACKING_Z + 0.0001)
    root.add(paint)
  }
  const innerBevelOuter = profile(0.005)
  const innerBevelInner = profile(0.011)
  innerBevelOuter.holes.push(innerBevelInner)
  const fasciaBevel = new Mesh(
    new ShapeGeometry(innerBevelOuter),
    new MeshBasicMaterial({ color: config.layout.trimColor }),
  )
  fasciaBevel.name = 'panel:fascia-bevel'
  fasciaBevel.position.z = BACKING_Z + 0.0002
  if (approvedFascia) fasciaBevel.layers.set(1)
  root.add(fasciaBevel)

  if (config.layout.panelProfile === 'us-fighter-cowl' && !approvedFascia) {
    const fasciaScrews: readonly (readonly [number, number])[] = [
      [-0.52, 0.041], [-0.41, 0.076], [-0.30, 0.079], [-0.205, 0.106],
      [-0.105, 0.143], [0, 0.143], [0.105, 0.143], [0.205, 0.106],
      [0.30, 0.079], [0.41, 0.076], [0.52, 0.041],
      [-0.57, -0.058], [0.57, -0.058], [-0.53, -0.155], [0.53, -0.155],
    ]
    for (const [i, [x, y]] of fasciaScrews.entries()) {
      addScrew(root, x, y, 0, i % 2 === 0 ? Math.PI / 4 : -Math.PI / 5, 0.0044)
    }
  }

  // Inset instrument structure is the other large family cue: a fighter's
  // three compact bays, a bomber desk, or Japanese pod/binnacle groupings.
  // These plates are dashboard-mounted and always remain behind instruments.
  const clusterY = PANEL_BELOW_M - lowerCentre
  const chamfered = (w: number, h: number, cut: number): Shape => {
    const shape = new Shape()
    shape.moveTo(-w / 2 + cut, h / 2)
    shape.lineTo(w / 2 - cut, h / 2)
    shape.lineTo(w / 2, h / 2 - cut)
    shape.lineTo(w / 2, -h / 2 + cut)
    shape.lineTo(w / 2 - cut, -h / 2)
    shape.lineTo(-w / 2 + cut, -h / 2)
    shape.lineTo(-w / 2, -h / 2 + cut)
    shape.lineTo(-w / 2, h / 2 - cut)
    shape.closePath()
    return shape
  }
  const addCluster = (name: string, x: number, w: number, h: number, cut: number): void => {
    const shadow = new Mesh(
      new ShapeGeometry(chamfered(w + 0.020, h + 0.020, cut + 0.006)),
      new MeshBasicMaterial({ color: 0x070c0f }),
    )
    shadow.name = `panel:cluster-shadow:${name}`
    shadow.position.set(x, clusterY - 0.002, BACKING_Z + 0.00015)
    root.add(shadow)
    const trim = new Mesh(
      new ShapeGeometry(chamfered(w + 0.013, h + 0.013, cut + 0.004)),
      new MeshBasicMaterial({ color: config.layout.trimColor }),
    )
    trim.name = `panel:cluster-trim:${name}`
    trim.position.set(x, clusterY, BACKING_Z + 0.0002)
    root.add(trim)
    const face = new Mesh(
      new ShapeGeometry(chamfered(w, h, cut)),
      new MeshBasicMaterial({ color: config.layout.clusterColor }),
    )
    face.name = `panel:cluster:${name}`
    face.position.set(x, clusterY, BACKING_Z + 0.0004)
    root.add(face)
    const sx = w / 2 - Math.max(0.011, cut * 0.55)
    const sy = h / 2 - 0.012
    addScrew(root, x - sx, clusterY + sy, 0, Math.PI / 4, 0.0038)
    addScrew(root, x + sx, clusterY + sy, 0, -Math.PI / 4, 0.0038)
    addScrew(root, x - sx, clusterY - sy, 0, -Math.PI / 5, 0.0038)
    addScrew(root, x + sx, clusterY - sy, 0, Math.PI / 5, 0.0038)
  }
  if (!approvedFascia) switch (config.layout.clusterPattern) {
    case 'single-well':
      addCluster('left', -0.275, 0.310, 0.136, 0.018)
      addCluster('centre', 0, 0.150, 0.140, 0.018)
      addCluster('right', 0.255, 0.310, 0.136, 0.018)
      break
    case 'split-console':
      addCluster('left', -0.235, 0.390, 0.140, 0.008)
      addCluster('right', 0.235, 0.390, 0.140, 0.008)
      break
    case 'three-pod':
      addCluster('left', -0.275, 0.205, 0.134, 0.028)
      addCluster('centre', 0, 0.315, 0.140, 0.034)
      addCluster('right', 0.285, 0.185, 0.134, 0.028)
      break
    case 'twin-binnacle':
      addCluster('left', -0.225, 0.380, 0.140, 0.025)
      addCluster('right', 0.225, 0.380, 0.140, 0.025)
      break
  }

  const badge = makeFamilyBadge(config.layout.badge)
  badge.position.set(0.430, 0.045, 0)
  badge.scale.setScalar(0.75)
  badge.visible = !approvedFascia
  root.add(badge)

  // The attitude ball occupies its own lower-row slot. Ruling
  // R1: this is panel geometry, not a `GAUGES` entry -- driven by
  // `attitudeAngles(state)` in `updatePanel`, below.
  //
  // A wrapper carries the slot's fixed position (matching how a `dial`
  // group carries its own slotX/row position while its needle inside moves
  // in purely local coordinates), so the ball's own geometry can be built
  // directly around the slot's own origin.
  {
    const attitudeSlot = PANEL_SLOTS.find((s) => s.id === 'attitude')
    if (!attitudeSlot) throw new Error('no layout slot for attitude')
    const attitudeFaceRadius = approvedFascia ? APPROVED_ATTITUDE_FACE_RADIUS : DIAL_RADIUS
    const attitudeGroup = new Group()
    attitudeGroup.name = 'attitude'
    attitudeGroup.position.set(
      attitudeSlot.centreX,
      PANEL_BELOW_M - lowerCentre + (approvedFascia ? APPROVED_DISPLAY_Y_OFFSET : 0),
      0,
    )
    root.add(attitudeGroup)

    // The ball: two meshes, sky over ground, whose GEOMETRY `updatePanel`
    // replaces every frame (`attitudeBallGeometry`, above) rather than a
    // rigid transform on a static, oversized mesh -- see that function's
    // doc comment for why. Built here at a level attitude so the panel is
    // never degenerate before the first `updatePanel` call -- the retired
    // horizon bar made the same claim about itself, and `panel.test.ts`'s
    // "starts level, before any update has run" (attitude ball describe
    // block) is this ball's own version of that check.
    const ball = new Group()
    ball.name = 'attitude:ball'
    const initial = attitudeBallGeometry(0, 0, attitudeFaceRadius)
    const sky = new Mesh(initial.sky, new MeshBasicMaterial({ color: 0x3f7fbf }))
    const ground = new Mesh(initial.ground, new MeshBasicMaterial({ color: 0x6b4f2a }))
    // Fixed order (sky then ground), relied on by `updatePanel` below --
    // never reordered.
    ball.add(sky, ground)
    attitudeGroup.add(ball)

    // The bezel ring, same shape as a dial's: it sits in FRONT of the ball
    // (a larger local Z, closer to the pilot -- see Z_MARKS's doc comment
    // on the dial bezel above), giving the row a uniform bezel look. It no
    // longer does any clipping work itself -- the ball's own geometry now
    // never exceeds `DIAL_RADIUS`, the ring's own inner radius -- so this is
    // purely the same decorative rim every other dial has.
    const attitudeShadow = new Mesh(
      new RingGeometry(DIAL_RADIUS * 1.09, DIAL_RADIUS * 1.18, 48),
      bezelShadowMat,
    )
    attitudeShadow.position.z = Z_MARKS * 0.18
    attitudeShadow.visible = !approvedFascia
    attitudeGroup.add(attitudeShadow)
    const attitudeLip = new Mesh(
      new RingGeometry(DIAL_RADIUS * 1.055, DIAL_RADIUS * 1.11, 48),
      bezelHighlightMat,
    )
    attitudeLip.position.z = Z_MARKS * 0.42
    attitudeLip.visible = !approvedFascia
    attitudeGroup.add(attitudeLip)
    const ring = new Mesh(new RingGeometry(DIAL_RADIUS, DIAL_RADIUS * 1.065, 48), bezelMat)
    ring.name = 'attitude:ring'
    ring.position.z = Z_MARKS
    ring.visible = !approvedFascia
    attitudeGroup.add(ring)
    const horizonMat = new MeshBasicMaterial({ color: 0xf2efe3 })
    const horizonLeft = new Mesh(new PlaneGeometry(0.022, 0.0018), horizonMat)
    horizonLeft.position.set(-0.017, 0, Z_NEEDLE)
    attitudeGroup.add(horizonLeft)
    const horizonRight = new Mesh(new PlaneGeometry(0.022, 0.0018), horizonMat)
    horizonRight.position.set(0.017, 0, Z_NEEDLE)
    attitudeGroup.add(horizonRight)
    const centreDot = new Mesh(new CircleGeometry(0.003, 16), horizonMat)
    centreDot.position.z = Z_NEEDLE
    attitudeGroup.add(centreDot)
    for (const y of [-0.012, 0.012]) {
      const pitchMark = new Mesh(new PlaneGeometry(0.016, 0.0012), horizonMat)
      pitchMark.position.set(0, y, Z_NEEDLE)
      attitudeGroup.add(pitchMark)
    }

    attitude = { ball, ring, faceRadius: attitudeFaceRadius }
  }

  // The sight's center sits on the line from the eye to where the rounds
  // pass at convergence range: local (0, PANEL_BELOW_M) is the eye's own
  // boresight, and the sight is lowered from there by the harmonization
  // angle (`gunHarmonization`, sim/weapons/harmonization.ts -- 0.28 degrees
  // for the F6F). Until 2026-09-25 it sat dead on the boresight, 0.9 m above
  // the line the guns aim along and with no allowance for drop, and a target
  // centered on it took zero hits at every range (the shootdown spike;
  // tests/render/gunsightBallistics.test.ts now fires production rounds
  // through it). An airplane with no guns keeps the boresight.
  const reticle = new Group()
  reticle.name = 'reticle'
  const sightDistance = PANEL_AHEAD_M - RETICLE_Z
  const depressionRad = spec.combat === undefined || spec.combat.guns.length === 0 ? 0 : gunHarmonization(spec.combat, spec.view.eyePointM).depressionRad
  const armM = sightDistance * Math.tan((RETICLE_SPAN_DEG * Math.PI) / 360)
  const gapM = sightDistance * Math.tan((RETICLE_GAP_DEG * Math.PI) / 360)
  const strokeM = armM * 0.14
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
  // The center dot (2026-09-25): the gap is 1 degree across and a fighter at
  // 300 m is about 0.3 degrees tall, so without a mark in the gap the pilot
  // cannot place the target on the aim point precisely. 0.2 degrees across:
  // visible, and still smaller than the target it sits on.
  const dot = new Mesh(new CircleGeometry(sightDistance * Math.tan((RETICLE_DOT_DEG * Math.PI) / 360), 16), reticleMat)
  dot.name = 'reticle:dot'
  reticle.add(dot)
  reticle.position.set(0, PANEL_BELOW_M - sightDistance * Math.tan(depressionRad), RETICLE_Z)
  reticle.visible = config.sight
  root.add(reticle)

  // The heading tape: a sliding compass strip across the upper band,
  // replacing the round HEADING dial (Task 5, 2026-09-15). Positioned from
  // `PANEL_BANDS.upper` directly, NOT from `slotX` -- `PANEL_SLOTS` has no
  // `heading` entry (deliberate: F4/context point 4), because the tape spans
  // the band's own width rather than a row slot.
  {
    const tapeGauge = gauges.find((g): g is TapeSpec => g.id === 'heading')!
    const stripW = TAPE_W * (360 / tapeGauge.windowSpan)
    const upperCentreY = (PANEL_BANDS.upper.top + PANEL_BANDS.upper.bottom) / 2
    const tapeY = PANEL_BELOW_M - upperCentreY

    const tapeShadow = new Mesh(new PlaneGeometry(TAPE_W + 0.030, 0.052), bezelShadowMat)
    tapeShadow.name = 'tape:housing-shadow'
    tapeShadow.position.set(0, tapeY, BACKING_Z + 0.0004)
    tapeShadow.visible = !approvedFascia
    root.add(tapeShadow)
    const tapeLip = new Mesh(new PlaneGeometry(TAPE_W + 0.020, 0.044), bezelHighlightMat)
    tapeLip.name = 'tape:housing-lip'
    tapeLip.position.set(0, tapeY, BACKING_Z + 0.0006)
    tapeLip.visible = !approvedFascia
    root.add(tapeLip)
    const tapeFace = new Mesh(
      new PlaneGeometry(TAPE_W + (approvedFascia ? 0.020 : 0.010), approvedFascia ? 0.060 : 0.036),
      approvedFascia ? new MeshBasicMaterial({ color: config.layout.faceColor }) : faceMat,
    )
    tapeFace.name = 'tape:housing-face'
    tapeFace.position.set(0, tapeY - (approvedFascia ? 0.006 : 0), approvedFascia ? 0.0004 : BACKING_Z + 0.0008)
    root.add(tapeFace)
    for (const [x, y, angle] of approvedFascia ? [] : [
      [-(TAPE_W + 0.020) / 2 + 0.008, tapeY + 0.015, Math.PI / 4],
      [(TAPE_W + 0.020) / 2 - 0.008, tapeY + 0.015, -Math.PI / 4],
      [-(TAPE_W + 0.020) / 2 + 0.008, tapeY - 0.015, -Math.PI / 5],
      [(TAPE_W + 0.020) / 2 - 0.008, tapeY - 0.015, Math.PI / 5],
    ] as const) addScrew(root, x, y, 0, angle, 0.0035)

    // The rose, drawn THREE copies end to end (copy in [-1, 0, 1]). Sliding
    // within the middle copy then always has a neighbour rendered on both
    // sides, so crossing north (359 -> 001) never exposes bare space at the
    // edge of the visible window or leaps the strip's whole width.
    const strip = new Group()
    strip.name = 'tape:strip'
    for (const copy of [-1, 0, 1]) {
      for (const mark of tickMarksFor(tapeGauge)) {
        // NOT `... - stripW / 2` (Ruling R9, review round 3): that term
        // centred the three-copy BLOCK's own extent on the origin, which
        // is cosmetic, but the slide below (`strip.position.x =
        // -tapeOffsetFor(...) * stripW`) assumes fraction `f` sits at `f *
        // stripW` with no such term. The two disagreed by exactly `stripW /
        // 2` -- half a rose, i.e. 180 degrees -- so the mark under the
        // index was always the heading's ANTIPODE, not the heading itself.
        // The strip's own extent is now asymmetric (`[-stripW, 2*stripW)`
        // rather than centred), which no longer matters: R8's per-frame
        // culling is what decides visibility, not this offset.
        const x = (mark.fraction + copy) * stripW
        const tick = new Mesh(
          new PlaneGeometry(0.002 * S, (mark.major ? 0.010 : 0.006) * S),
          new MeshBasicMaterial({ color: 0xe6ecf5 }),
        )
        tick.position.set(x, 0.006 * S, Z_MARKS)
        // Local x stashed on `userData` (Ruling R8, review round 2): nothing
        // clips or masks the strip, so without per-frame culling all three
        // copies paint across the sky and sea for the whole width of the
        // view and past it (measured at deploy time: 71.67 degrees off
        // boresight against a 40.89-degree frame half-width at 3:2).
        // `updatePanel` reads this back to decide `.visible` against the
        // `TAPE_W` window every tick, alongside the slide it already does.
        tick.userData.localX = x
        // The VALUE this mark stands for, stashed alongside its position
        // (Ruling R9, review round 3): tests recover "which heading is
        // under the index" from the nearest mark's own stashed value rather
        // than re-deriving it from a formula that could itself be wrong --
        // which is exactly how a 180-degree placement error survived two
        // review rounds.
        tick.userData.value = mark.value
        strip.add(tick)
        if (mark.major) {
          const numeral = textPlate(
            mark.text,
            approvedFascia ? 0.026 : 0.022 * S,
            approvedFascia ? 0.014 : 0.011 * S,
            makeText,
          )
          numeral.position.set(x, -0.006 * S, Z_MARKS)
          numeral.userData.localX = x
          numeral.userData.value = mark.value
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
      new PlaneGeometry(0.0025 * S, 0.016 * S),
      new MeshBasicMaterial({ color: 0xffd24a }),
    )
    index.name = 'tape:index'
    index.position.set(0, tapeY - 0.001 * S, Z_NEEDLE)
    root.add(index)

    const tapeReadout = textPlate('', 0.05 * S, 0.020 * S, makeText)
    tapeReadout.name = 'tape:readout'
    tapeReadout.position.set(0, tapeY - 0.028 * S, Z_READOUT)
    if (approvedFascia) tapeReadout.layers.set(1)
    root.add(tapeReadout)

    tape = { strip, readout: tapeReadout }
  }

  // One integrated equipment bank: flight-configuration lamps on the upper
  // row and live armament counts below. This replaces the preview's four
  // loose lamps outside the apparent dashboard edge.
  const lightMeshes = {} as { gear: Mesh; flap: Mesh; hook: Mesh; bay: Mesh }
  {
    const shadow = new Mesh(
      new PlaneGeometry(EQUIPMENT_BANK_W + 0.018, EQUIPMENT_BANK_H + 0.018),
      bezelShadowMat,
    )
    shadow.name = 'equipment:shadow'
    shadow.position.set(EQUIPMENT_BANK_X, EQUIPMENT_BANK_Y - 0.002, BACKING_Z + 0.0004)
    shadow.visible = !approvedFascia
    root.add(shadow)
    const trim = new Mesh(
      new PlaneGeometry(EQUIPMENT_BANK_W + 0.010, EQUIPMENT_BANK_H + 0.010),
      bezelHighlightMat,
    )
    trim.name = 'equipment:trim'
    trim.position.set(EQUIPMENT_BANK_X, EQUIPMENT_BANK_Y, BACKING_Z + 0.0006)
    trim.visible = !approvedFascia
    root.add(trim)
    const bank = new Mesh(
      new PlaneGeometry(EQUIPMENT_BANK_W, EQUIPMENT_BANK_H + (approvedFascia ? 0.016 : 0)),
      new MeshBasicMaterial({ color: config.layout.clusterColor }),
    )
    bank.name = 'equipment:bank'
    bank.position.set(
      EQUIPMENT_BANK_X,
      EQUIPMENT_BANK_Y - (approvedFascia ? 0.007 : 0),
      approvedFascia ? 0.0004 : BACKING_Z + 0.0008,
    )
    root.add(bank)
    if (!approvedFascia) {
      addScrew(root, EQUIPMENT_BANK_X - EQUIPMENT_BANK_W / 2 - 0.002, EQUIPMENT_BANK_Y + EQUIPMENT_BANK_H / 2, 0, Math.PI / 4, 0.0034)
      addScrew(root, EQUIPMENT_BANK_X + EQUIPMENT_BANK_W / 2 + 0.002, EQUIPMENT_BANK_Y + EQUIPMENT_BANK_H / 2, 0, -Math.PI / 4, 0.0034)
      addScrew(root, EQUIPMENT_BANK_X - EQUIPMENT_BANK_W / 2 - 0.002, EQUIPMENT_BANK_Y - EQUIPMENT_BANK_H / 2, 0, -Math.PI / 5, 0.0034)
      addScrew(root, EQUIPMENT_BANK_X + EQUIPMENT_BANK_W / 2 + 0.002, EQUIPMENT_BANK_Y - EQUIPMENT_BANK_H / 2, 0, Math.PI / 5, 0.0034)
    }
    const dividerMat = new MeshBasicMaterial({ color: config.layout.trimColor })
    const rowDivider = new Mesh(new PlaneGeometry(EQUIPMENT_BANK_W - 0.006, 0.0015), dividerMat)
    rowDivider.position.set(EQUIPMENT_BANK_X, EQUIPMENT_BANK_Y, Z_MARKS)
    root.add(rowDivider)
    for (let i = 1; i < 4; i++) {
      const divider = new Mesh(new PlaneGeometry(0.0012, EQUIPMENT_BANK_H / 2 - 0.004), dividerMat)
      divider.position.set(
        EQUIPMENT_BANK_X - EQUIPMENT_BANK_W / 2 + EQUIPMENT_CELL_W * i,
        EQUIPMENT_BANK_Y - EQUIPMENT_BANK_H / 4,
        Z_MARKS,
      )
      root.add(divider)
    }

    const japanese = config.layout.unitProfile === 'metric-japanese'
    const lightY = EQUIPMENT_BANK_Y + 0.009
    const status = [
      ['gear', japanese ? '脚' : 'GEAR', config.gear],
      ['flap', japanese ? '翼' : 'FLAP', config.flap],
      ['hook', japanese ? '鉤' : 'HOOK', config.hook],
      ['bay', japanese ? '扉' : 'BAY', config.bay],
    ] as const
    const activeStatus = status.filter((entry) => entry[2])
    for (const [id, label, active] of status) {
      const activeIndex = activeStatus.findIndex((entry) => entry[0] === id)
      const cellW = EQUIPMENT_BANK_W / Math.max(1, activeStatus.length)
      const x = active
        ? EQUIPMENT_BANK_X - EQUIPMENT_BANK_W / 2 + cellW * (activeIndex + 0.5)
        : EQUIPMENT_BANK_X
      const bezel = new Mesh(new PlaneGeometry(cellW * 0.64, 0.015), bezelMat)
      bezel.position.set(x, lightY, Z_MARKS * 0.75)
      bezel.visible = active
      root.add(bezel)
      const light = new Mesh(new PlaneGeometry(cellW * 0.53, 0.010), new MeshBasicMaterial({ color: LIGHT_OFF }))
      light.name = `light:${id}`
      light.position.set(x, lightY, Z_MARKS + 0.0003)
      light.visible = active
      root.add(light)
      const plate = textPlate(label, cellW * 0.86, 0.009, makeText)
      plate.position.set(x, EQUIPMENT_BANK_Y + 0.024, Z_READOUT)
      plate.visible = active
      root.add(plate)
      lightMeshes[id] = light
    }

    const labels: Readonly<Record<ArmamentId, string>> = japanese
      ? { ammo: '弾薬', bomb: '爆弾', rocket: '噴進', torpedo: '魚雷' }
      : { ammo: 'AMMO', bomb: 'BOMB', rocket: 'RKT', torpedo: 'TORP' }
    ARMAMENT_IDS.forEach((id, i) => {
      const x = EQUIPMENT_CELL_X(i)
      const label = textPlate(labels[id], EQUIPMENT_CELL_W * 0.88, 0.008, makeText)
      label.name = `armament:label:${id}`
      label.position.set(x, EQUIPMENT_BANK_Y - 0.007, Z_READOUT)
      root.add(label)
      const value = textPlate('', EQUIPMENT_CELL_W * 0.88, 0.012, makeText)
      value.name = `armament:value:${id}`
      value.position.set(x, EQUIPMENT_BANK_Y - 0.019, Z_READOUT)
      root.add(value)
      armament.set(id, { mesh: value, text: '' })
    })
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
  return {
    config,
    root,
    needles,
    rpmNeedles,
    readouts,
    columns,
    attitude: attitude!,
    radar: { face: radarFace, faceRadius: radarFaceRadius },
    reticle,
    backing,
    tape: tape!,
    lights: lightMeshes,
    armament,
    badge,
  }
}

/** Keep the coaming clipped at both screen edges as the viewport changes. */
export function resizePanel(panel: Panel, aspect: number): void {
  const scaleX = Math.max(1, aspect / PANEL_MIN_ASPECT)
  panel.backing.scale.x = scaleX
  const paint = panel.root.getObjectByName('panel:fascia-paint')
  if (paint) paint.scale.x = scaleX
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
   * The attitude to lay the attitude ball's horizon against, when it differs
   * from the simulated one.
   *
   * The camera and the airframe are posed from the INTERPOLATED tick, the
   * numeric gauges from the simulated one. This parameter exists because of
   * the horizon bar the ball replaced (Task 7, 2026-09-15 retired the bar
   * itself, not this parameter): until 2026-09-13 that bar took the
   * simulated attitude too, so at 80 deg/s of roll it led the visible horizon
   * by up to a third of a tick -- 1.33 degrees of sawtooth against the one
   * thing it exists to agree with, worst on a display faster than the 60 Hz
   * sim. The ball uses it for the same reason (`updatePanel`'s own attitude-
   * ball code below). The numbers on the dials are unaffected: nothing on
   * screen contradicts them, so reading them a fraction of a tick early is
   * invisible.
   */
  renderAttitude: AircraftState['attitude'] = state.attitude,
  /** The velocity of the air, for the AIRSPEED dial: `World.wind`, threaded
   *  from main.ts. See `Wind` in ../gauges.ts for why it is defaulted. */
  wind: Wind = null,
  /** The player's live combat record. Optional keeps headless layout tests
   *  simple; production always supplies it so the equipment bank is live. */
  combat: AircraftCombat | null = null,
): void {
  const gauges = gaugesFor(panel.config.layout.unitProfile)
  for (const g of gauges) {
    const readout = panel.readouts.get(g.id)
    if (readout) {
      const text = readoutTextFor(g.id, spec, state, controls, wind, panel.config.layout.unitProfile)
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
      const value = gaugeValue(g.id, spec, state, controls, wind, panel.config.layout.unitProfile)
      const fraction = g.id === 'fuel' ? fuelFraction(spec, state) : fractionForValue(g, value)
      column.fill.scale.y = Math.max(1e-4, fraction)
      column.fill.visible = fraction > 0
    }
    const needle = panel.needles.get(g.id)
    if (!needle) continue
    if (g.id === 'slip') {
      const value = gaugeValue(g.id, spec, state, controls, wind, panel.config.layout.unitProfile)
      const fraction = fractionForValue(g, value)
      needle.position.x = (fraction - 0.5) * DIAL_RADIUS * 1.18
      needle.rotation.z = 0
      continue
    }
    const angle = needleAngleFor(g.id, spec, state, wind, panel.config.layout.unitProfile)
    // Negative: needle angles are clockwise from the dial's zero (gauges.ts),
    // and a positive rotation about +Z in this frame is anticlockwise.
    needle.rotation.z = -angle
  }
  const rpmGauge = gauges.find((g): g is DialSpec => g.id === 'rpm')!
  panel.rpmNeedles.forEach((needle, i) => {
    needle.rotation.z = -angleForValue(rpmGauge, state.engineRpm[i] ?? state.engineRpm[0] ?? 0)
  })

  // The heading tape: slide the rose under the fixed index, and print the
  // digits on the fixed readout. Not reached through `panel.readouts` above
  // -- `heading` is a `TapeSpec`, not a dial, so `createPanel` never put it
  // in that map (it filters to `kind === 'dial'`).
  {
    const tapeGauge = gauges.find((g): g is TapeSpec => g.id === 'heading')!
    const stripW = TAPE_W * (360 / tapeGauge.windowSpan)
    const headingDeg = gaugeValue('heading', spec, state, controls, wind, panel.config.layout.unitProfile)
    const stripX = -tapeOffsetFor(tapeGauge, headingDeg) * stripW
    panel.tape.strip.position.x = stripX
    // Cull to the visible window, per frame (Ruling R8, review round 2):
    // there is no clipping plane, stencil or mask anywhere in this file, so
    // without this every one of the ~108 tick/numeral meshes across all
    // three copies would render regardless of where it lands -- most of the
    // rose painted across the sky and sea, well past the panel, for the
    // whole width of the view and beyond. A mark counts as visible only
    // once its WORLD-relative x (`stripX + its own local x`, stashed on
    // `userData.localX` at build time) falls inside `TAPE_W`'s window, with
    // `TAPE_CULL_MARGIN_M` of slack so a mark does not pop right at the
    // edge.
    for (const mark of panel.tape.strip.children) {
      const localX = mark.userData.localX as number
      mark.visible = Math.abs(stripX + localX) <= TAPE_W / 2 + TAPE_CULL_MARGIN_M
    }
    // Cached on `userData`, the same "only on a real change" saving the
    // dial readouts get from `panel.readouts`' own `Readout.text` field --
    // `Panel.tape.readout` is a bare `Mesh` (the interface this task was
    // handed), so there is no sibling wrapper to hold the last string.
    const text = readoutTextFor('heading', spec, state, controls, wind, panel.config.layout.unitProfile)
    if (panel.tape.readout.userData.text !== text) {
      setPlateText(panel.tape.readout, text, makeText)
      panel.tape.readout.userData.text = text
    }
  }
  // The gear and flap lights, from the strip's own three-state reading so
  // the two can never disagree about what a fraction means.
  const lightColour = (display: string): number =>
    display === 'DOWN' ? LIGHT_DOWN : display === 'UP' ? LIGHT_OFF : LIGHT_TRANSIT
  ;(panel.lights.gear.material as MeshBasicMaterial).color.setHex(lightColour(gearDisplay(state.gearFraction)))
  ;(panel.lights.flap.material as MeshBasicMaterial).color.setHex(lightColour(flapDisplay(state.flapFraction)))
  ;(panel.lights.hook.material as MeshBasicMaterial).color.setHex(controls.hookDown === true ? LIGHT_DOWN : LIGHT_OFF)
  ;(panel.lights.bay.material as MeshBasicMaterial).color.setHex(lightColour(flapDisplay(state.bayDoorFraction)))

  const armament = armamentValues(spec, combat)
  for (const id of ARMAMENT_IDS) {
    const readout = panel.armament.get(id)!
    const text = armament[id]
    if (text !== readout.text) {
      setPlateText(readout.mesh, text, makeText)
      readout.text = text
    }
  }

  const { rollRad, pitchRad } = attitudeAngles({ ...state, attitude: renderAttitude })

  // The attitude ball, from `rollRad`/`pitchRad` above -- via `renderAttitude`,
  // not the simulated attitude, so it never lags the visible horizon under
  // fast roll (see this function's `renderAttitude` doc comment).
  //
  // A real artificial horizon stays level with the WORLD, so the ball's own
  // horizon chord must sit at the angle the true horizon appears at in the
  // pilot's view -- which is NOT the same as "rotate the ball opposite the
  // aircraft's roll number".
  //
  // This frame's +Z points back at the pilot (the panel root is turned -pi/2
  // about Y, sending local +Z to body -X), so a POSITIVE rotation about Z is
  // anticlockwise on screen; and in a right bank the true horizon appears
  // rotated anticlockwise. Both signs therefore go the same way, which is why
  // the `attitudeBallGeometry` call below is given `rollRad` directly, not
  // `-rollRad`.
  //
  // Measured 2026-09-13, before this ball existed, on this same codebase's
  // former horizon bar (createPanel/updatePanel/cameraTransformFor/
  // toThreeOrientation, posed as main.ts poses them): at a 30-degree right
  // bank `rotation.z = rollRad` read +30.00 degrees (+ = right end up)
  // against a true horizon of +30.00; `-rollRad` read -30.00, a 60-degree
  // error that scaled with bank and that the bar's own test had asserted for
  // fifteen task reviews before being caught. Task 7 (2026-09-15) retired
  // that bar once this ball carried equivalent coverage
  // (tests/render/panel.test.ts's "the attitude ball" describe block), but
  // the sign derivation above is exactly as load-bearing for the ball's own
  // `rollRad` as it was for the bar's, which is why it moved here rather than
  // being deleted with the code it used to describe.
  //
  // Rebuilt as fresh geometry (`attitudeBallGeometry`'s own doc comment has
  // the fix's full history) rather than moved as a rigid transform: fix
  // round 1 on Task 6 found the disc, moved by `rotation.z`/`position.y`
  // alone, drew 56 mm into the fuel dial's face at a 45-degree bank, because
  // nothing in this renderer actually clips anything. The two meshes' own
  // old geometries are disposed -- the same "don't leak one GPU resource per
  // change" rule `setPlateText` follows for readout textures above.
  const [sky, ground] = panel.attitude.ball.children as [Mesh, Mesh]
  const nextBall = attitudeBallGeometry(rollRad, pitchRad, panel.attitude.faceRadius)
  sky.geometry.dispose()
  sky.geometry = nextBall.sky
  ground.geometry.dispose()
  ground.geometry = nextBall.ground
}
