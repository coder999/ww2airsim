import { AddEquation, CustomBlending, DoubleSide, MaxEquation, OneFactor, OneMinusSrcAlphaFactor, Vector2, Vector3 } from 'three'
import { NodeMaterial, type Node, type TextureNode, type UniformNode } from 'three/webgpu'
import {
  abs, attribute, clamp, cos, cross, dot, exp, float, floor, fract, int, ivec2, length, max, min, mix, mod, normalize,
  perspectiveDepthToViewZ, positionGeometry, screenCoordinate, select, sin, smoothstep, texture, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl'
import { aerialPerspective } from '../scene/atmosphereShading.js'
import type { CloudShadowHandle } from '../scene/cloudShadow.js'
import { cloudSkylightNode, skyIrradianceDownNode, skyIrradianceUpNode, sunColorNode, sunDirectionNode } from '../scene/lighting.js'
import {
  CLOSENESS_SCALE_M, DENSE_FRAGMENT_ALPHA, FIRE_RADIANCE, NEAR_FADE_END_M, NEAR_FADE_START_M, SOFT_MIN_M, SOFT_SIZE_FRACTION,
} from './shading.js'
import type { FxSheetTextures } from './sheets.js'

/** Written by fxPass.ts every frame it draws; shared by both materials and the composite. */
export type FxUniforms = {
  /** Full-resolution pixels per fx texel (a whole number: 2 or 4). */
  readonly span: UniformNode<'float', number>
  /** Drawing-buffer size minus one, in pixels. */
  readonly fullMax: UniformNode<'vec2', Vector2>
  readonly camRight: UniformNode<'vec3', Vector3>
  readonly camUp: UniformNode<'vec3', Vector3>
  /** The camera's +Z in world space: toward the viewer. */
  readonly camBack: UniformNode<'vec3', Vector3>
  /** `scene.position` this frame, i.e. minus the eye (Ruling R10). */
  readonly worldOffset: UniformNode<'vec3', Vector3>
  readonly frameBlend: UniformNode<'float', number>
  readonly mipBias: UniformNode<'float', number>
}
export const createFxUniforms = (): FxUniforms => ({
  span: uniform(2), fullMax: uniform(new Vector2(1, 1)),
  camRight: uniform(new Vector3(1, 0, 0)), camUp: uniform(new Vector3(0, 1, 0)), camBack: uniform(new Vector3(0, 0, 1)),
  worldOffset: uniform(new Vector3()), frameBlend: uniform(1), mipBias: uniform(0),
}) as unknown as FxUniforms

export type FxMaterialInputs = {
  readonly sheets: FxSheetTextures
  readonly sceneDepth: TextureNode
  readonly near: Node<'float'>
  readonly far: Node<'float'>
  readonly u: FxUniforms
  /** false under DEV ?fxSoft=off: a hard depth test instead of the soft fade. */
  readonly soft: boolean
  readonly shadow: CloudShadowHandle | null
}

function particleNodes(i: FxMaterialInputs) {
  const { u } = i
  const m = i.sheets.manifest
  const posSize = attribute('fxPosSize', 'vec4'), anim = attribute('fxAnim', 'vec4'), tint = attribute('fxTint', 'vec4'), vel = attribute('fxVel', 'vec4')
  const corner = positionGeometry.xy
  const size = posSize.w
  const c = cos(anim.x), s = sin(anim.x)
  const right = u.camRight.mul(c).add(u.camUp.mul(s))
  const up = u.camUp.mul(c).sub(u.camRight.mul(s))
  const centerRel = posSize.xyz.add(u.worldOffset)
  const toCam = normalize(centerRel.negate())
  const axis = normalize(vel.xyz.sub(toCam.mul(dot(vel.xyz, toCam))).add(u.camUp.mul(1e-4)))
  const side = normalize(cross(axis, toCam))
  const isStreak = anim.w.lessThan(0)
  const spriteOffset = right.mul(corner.x).add(up.mul(corner.y)).mul(size.mul(0.5))
  const streakOffset = side.mul(corner.x.mul(size.mul(0.5))).add(axis.mul(corner.y.mul(max(vel.w, size).mul(0.5))))
  const position = posSize.xyz.add(select(isStreak, streakOffset, spriteOffset))
  const rel = position.add(u.worldOffset)
  const L = normalize(sunDirectionNode)
  const l = vec3(dot(L, right), dot(L, up), dot(L, u.camBack))
  const lp = max(l, vec3(0)), ln = max(l.negate(), vec3(0))
  const cols = float(m.cols), rows = float(m.rows)
  const cell = max(anim.w, 0)
  return {
    position,
    quadUv: varying(vec2(corner.x.mul(0.5).add(0.5), float(0.5).sub(corner.y.mul(0.5)))),
    cellOrigin: varying(vec2(mod(cell, cols), floor(cell.div(cols))).div(vec2(cols, rows))),
    lPos: varying(lp.mul(lp)), lNeg: varying(ln.mul(ln)),
    sunT: varying(i.shadow ? i.shadow.node(rel as unknown as Node<'vec3'>, 'eyeRelative') : float(1)),
    ap: varying(aerialPerspective(rel as unknown as Node<'vec3'>, length(rel) as unknown as Node<'float'>)),
    viewZ: varying(dot(rel, u.camBack).negate()),
    alpha: varying(anim.z), frame: varying(anim.y), streak: varying(select(isStreak, float(1), float(0))),
    tint: varying(tint), size: varying(size),
  }
}

function shade(i: FxMaterialInputs, v: ReturnType<typeof particleNodes>) {
  const m = i.sheets.manifest
  const cellSize = vec2(1 / m.cols, 1 / m.rows)
  const inset = vec2(0.5 / (m.cols * m.cellPx), 0.5 / (m.rows * m.cellPx))
  const lo = v.cellOrigin.add(inset), hi = v.cellOrigin.add(cellSize).sub(inset)
  const atlasUv = v.cellOrigin.add(v.quadUv.mul(cellSize))
  const blending = i.u.frameBlend.greaterThan(0.5)
  const last = float(m.frames - 1)
  const f0 = min(select(blending, floor(v.frame), floor(v.frame.add(0.5))), last)
  const f1 = min(f0.add(1), last)
  const w = select(blending, fract(v.frame), float(0))
  const lightA = texture(i.sheets.lightA), lightB = texture(i.sheets.lightB), motion = texture(i.sheets.motion)
  // Every sample unconditional: textureSample must stay in uniform control flow (docs/clouds.md §4).
  const flow = (layer: Node<'float'>) => motion.sample(atlasUv).depth(int(layer)).rg.mul(2).sub(1).mul(m.motionScale).mul(cellSize)
  const uvA = clamp(atlasUv.sub(flow(f0).mul(w)), lo, hi)
  const uvB = clamp(atlasUv.add(flow(f1).mul(float(1).sub(w))), lo, hi)
  const at = (t: TextureNode, uv: Node<'vec2'>, layer: Node<'float'>) => t.sample(uv).depth(int(layer)).bias(i.u.mipBias)
  const A = mix(at(lightA, uvA, f0), at(lightA, uvB, f1), w)
  const B = mix(at(lightB, uvA, f0), at(lightB, uvB, f1), w)
  const skyUp = skyIrradianceUpNode.add(cloudSkylightNode)
  const direct = dot(v.lPos, vec3(A.r, A.b, B.b)).add(dot(v.lNeg, vec3(A.g, B.r, B.g)))
  const ambient = skyUp.mul(A.b).add(skyIrradianceDownNode.mul(B.r)).add(skyUp.add(skyIrradianceDownNode).mul(0.125).mul(A.r.add(A.g).add(B.g).add(B.b)))
  const e = B.a.mul(v.tint.a)
  const fire = vec3(e, e.mul(e).mul(0.6), e.mul(e).mul(e).mul(e).mul(0.3)).mul(FIRE_RADIANCE)
  const spriteRad = v.tint.rgb.mul(1 / Math.PI).mul(sunColorNode.mul(v.sunT).mul(direct).add(ambient)).add(fire)
  const sx = v.quadUv.x.mul(2).sub(1), sy = v.quadUv.y.mul(2).sub(1)
  const streakA = exp(sx.mul(sx).mul(-4)).mul(float(1).sub(abs(sy)))
  const streakRad = v.tint.rgb.mul(1 / Math.PI).mul(sunColorNode.mul(v.sunT).mul(0.5).add(skyUp.add(skyIrradianceDownNode).mul(0.5)))
    .add(v.tint.rgb.mul(v.tint.a).mul(FIRE_RADIANCE))
  const isStreak = v.streak.greaterThan(0.5)
  // Soft particles and the depth test in one term (Ruling R11): the fx pass has no depth buffer.
  const full = ivec2(min(floor(floor(screenCoordinate.xy).add(0.5).mul(i.u.span)), i.u.fullMax))
  const sceneZ = perspectiveDepthToViewZ(i.sceneDepth.load(full).x, i.near, i.far).negate()
  const soft = i.soft
    ? clamp(sceneZ.sub(v.viewZ).div(max(v.size.mul(SOFT_SIZE_FRACTION), SOFT_MIN_M)), 0, 1)
    : select(sceneZ.greaterThan(v.viewZ), float(1), float(0))
  const a = select(isStreak, streakA, A.a).mul(v.alpha).mul(soft).mul(smoothstep(NEAR_FADE_START_M, NEAR_FADE_END_M, v.viewZ))
  const radiance = select(isStreak, streakRad, spriteRad)
  return { a, color: radiance.mul(v.ap.a).add(v.ap.rgb) }
}

function base(material: NodeMaterial): NodeMaterial {
  material.transparent = true
  material.depthTest = false
  material.depthWrite = false
  material.side = DoubleSide
  material.blending = CustomBlending
  return material
}

export function createFxMaterials(i: FxMaterialInputs): { readonly particle: NodeMaterial; readonly dense: NodeMaterial } {
  const pv = particleNodes(i), ps = shade(i, pv)
  const particle = base(new NodeMaterial())
  particle.name = 'FxParticle'
  particle.positionNode = pv.position
  particle.fragmentNode = vec4(ps.color.mul(ps.a), ps.a)
  particle.blendEquation = AddEquation
  particle.blendSrc = OneFactor; particle.blendDst = OneMinusSrcAlphaFactor
  particle.blendSrcAlpha = OneFactor; particle.blendDstAlpha = OneMinusSrcAlphaFactor

  const dv = particleNodes(i), ds = shade(i, dv)
  const dense = base(new NodeMaterial())
  dense.name = 'FxDense'
  dense.positionNode = dv.position
  const closeness = float(1).div(float(1).add(dv.viewZ.div(CLOSENESS_SCALE_M)))
  dense.fragmentNode = vec4(select(ds.a.greaterThan(DENSE_FRAGMENT_ALPHA), closeness, float(0)), 0, 0, 1)
  // WebGPU requires factor 'one' for min/max operations.
  dense.blendEquation = MaxEquation; dense.blendEquationAlpha = MaxEquation
  dense.blendSrc = OneFactor; dense.blendDst = OneFactor; dense.blendSrcAlpha = OneFactor; dense.blendDstAlpha = OneFactor
  return { particle, dense }
}
