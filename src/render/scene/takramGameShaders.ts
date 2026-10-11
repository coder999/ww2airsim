import { cloudsFragment, fullscreenVertex } from './takramReferenceShaders.js'

/**
 * The accepted stand-alone march, changed only at its output boundary:
 * remove the spike's private sky/cirrus backdrop and expose low-cloud
 * radiance, opacity, and representative depth for the game's compositor.
 * Exact replacements make an upstream edit fail loudly instead of silently
 * changing the integrated image.
 */
export function takramGameCloudsFragment(): string {
  const replace = (source: string, before: string, after: string): string => {
    if (!source.includes(before)) throw new Error(`Takram game shader anchor missing: ${before.slice(0, 60)}`)
    return source.replace(before, after)
  }
  let source = cloudsFragment
  source = replace(source,
    'struct FragmentOutput { @location(0) colourDepth: vec4f }',
    'struct FragmentOutput { @location(0) colourOpacity: vec4f, @location(1) cloudDepth: vec4f }')
  source = replace(source,
    '  var colour = sky(direction);\n  var transmittanceIntegral = 1.0;',
    '  let background = sky(direction);\n  var colour = background;\n  var transmittanceIntegral = 1.0;')
  source = replace(source,
    '  let origin = u.cameraPositionCoverage.xyz;',
    '  // Recenter Leyte on the accepted Takram reference weather pose.\n  let origin = u.cameraPositionCoverage.xyz - vec3f(289000.0, 0.0, -56000.0);')
  source = replace(source,
    'fn layerDensity(position: vec3f, layer: u32, weatherMip: f32, shapeMip: f32, jitter: f32) -> f32 {\n  var low = 750.0;',
    'fn layerDensity(position: vec3f, layer: u32, weatherMip: f32, shapeMip: f32, jitter: f32) -> f32 {\n  // The approved reference looks along -Z; Leyte sorties launch east (+X).\n  let modelPosition = vec3f(position.z, position.y, -position.x);\n  let layerOffset = u.sunDirectionExposure.w;\n  var low = 750.0 + layerOffset;')
  source = replace(source, '  var high = 1400.0;', '  var high = 1400.0 + layerOffset;')
  source = replace(source, '  if (layer == 1u) { low = 1000.0; high = 2200.0; }', '  if (layer == 1u) { low = 1000.0 + layerOffset; high = 2200.0 + layerOffset; }')
  source = replace(source, '  let uv = weatherUv(position);', '  let uv = weatherUv(modelPosition);')
  source = replace(source, '  let weatherSample = continuousWeather(position, weatherMip);', '  let weatherSample = continuousWeather(modelPosition, weatherMip);')
  source = replace(source, '  let ecef = toEcef(position);', '  let ecef = toEcef(modelPosition);')
  source = replace(source,
    '  let lowInterval = layerInterval(origin.y, direction.y, 750.0, 2200.0);',
    '  let layerOffset = u.sunDirectionExposure.w;\n  let lowInterval = layerInterval(origin.y, direction.y, 750.0 + layerOffset, 2200.0 + layerOffset);')
  source = replace(source,
    '      let inLayer = samplePosition.y > 750.0 && samplePosition.y < 2200.0;',
    '      let inLayer = samplePosition.y > 750.0 + layerOffset && samplePosition.y < 2200.0 + layerOffset;')
  source = replace(source,
    '      let h = remap(samplePosition.y, 750.0, 2200.0);',
    '      let h = remap(samplePosition.y, 750.0 + layerOffset, 2200.0 + layerOffset);')
  source = replace(source,
    '  if (direction.y > 0.001) {',
    '  if (false && direction.y > 0.001) {')
  source = replace(source,
    '  out.colourDepth = vec4f(colour * 0.1, frontDepth / 200000.0);',
    '  // The spike divided by ten before its private AgX multiplied by ten.\n  // The game already owns exposure and AgX, so hand it unscaled HDR radiance.\n  let cloudRadiance = max(vec3f(0.0), colour - background * transmittanceIntegral);\n  out.colourOpacity = vec4f(cloudRadiance, 1.0 - transmittanceIntegral);\n  out.cloudDepth = vec4f(frontDepth / 200000.0, 0.0, 0.0, 1.0);')
  return source
}

export { fullscreenVertex }

export const takramGameTemporalFragment = /* wgsl */ `
struct Uniforms {
  resolutionFrame: vec4f,
  cameraPositionCoverage: vec4f,
  cameraForwardFov: vec4f,
  cameraRightAspect: vec4f,
  cameraUpTime: vec4f,
  sunDirectionExposure: vec4f,
  previousPositionValid: vec4f,
  previousForwardFov: vec4f,
  previousRightAspect: vec4f,
  previousUp: vec4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var currentColour: texture_2d<f32>;
@group(0) @binding(3) var currentDepth: texture_2d<f32>;
@group(0) @binding(4) var historyColour: texture_2d<f32>;
@group(0) @binding(5) var historyDepth: texture_2d<f32>;

struct TemporalOutput {
  @location(0) colourOpacity: vec4f,
  @location(1) cloudDepth: vec4f,
}

fn currentRay(pixel: vec2f) -> vec3f {
  let ndc = pixel / u.resolutionFrame.xy * 2.0 - 1.0;
  return normalize(u.cameraForwardFov.xyz + u.cameraRightAspect.xyz * ndc.x * u.cameraRightAspect.w * u.cameraForwardFov.w - u.cameraUpTime.xyz * ndc.y * u.cameraForwardFov.w);
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> TemporalOutput {
  var phaseOffsets = array<vec2u, 6>(
    vec2u(0, 0), vec2u(1, 2), vec2u(0, 1),
    vec2u(1, 0), vec2u(0, 2), vec2u(1, 1)
  );
  let pixel = vec2u(position.xy);
  let phase = u32(u.resolutionFrame.z) % 6u;
  let phaseCentre = vec2f(phaseOffsets[phase]) + 0.5;
  let phaseScale = vec2f(2.0, 3.0);
  let lowSize = vec2f(textureDimensions(currentColour));
  let reconstructedUv = ((position.xy - phaseCentre) / phaseScale + 0.5) / lowSize;
  let reconstructedColour = textureSampleLevel(currentColour, linearSampler, reconstructedUv, 0.0);
  let reconstructedDepth = textureSampleLevel(currentDepth, linearSampler, reconstructedUv, 0.0).r;
  let lowPixel = vec2i(pixel / vec2u(2u, 3u));
  let exactColour = textureLoad(currentColour, lowPixel, 0);
  let exactDepth = textureLoad(currentDepth, lowPixel, 0).r;
  let distance = reconstructedDepth * 200000.0;
  let world = u.cameraPositionCoverage.xyz + currentRay(position.xy) * distance;
  let relative = world - u.previousPositionValid.xyz;
  let z = dot(relative, u.previousForwardFov.xyz);
  let previousNdc = vec2f(
    dot(relative, u.previousRightAspect.xyz) / max(1.0, z * u.previousForwardFov.w * u.previousRightAspect.w),
    -dot(relative, u.previousUp.xyz) / max(1.0, z * u.previousForwardFov.w)
  );
  let previousUv = previousNdc * 0.5 + 0.5;
  let validUv = all(previousUv > vec2f(0.002)) && all(previousUv < vec2f(0.998)) && z > 0.0;
  let previousColour = textureSampleLevel(historyColour, linearSampler, previousUv, 0.0);
  let previousDepthValue = textureSampleLevel(historyDepth, linearSampler, previousUv, 0.0).r;
  let historyValid = u.previousPositionValid.w > 0.5 && validUv;
  let isCurrentPixel = all((pixel % vec2u(2u, 3u)) == phaseOffsets[phase]);
  let freshColour = select(reconstructedColour, exactColour, isCurrentPixel);
  let freshDepth = select(reconstructedDepth, exactDepth, isCurrentPixel);
  // History survives by neighborhood clamping, not by a depth comparison: the
  // representative depth jumps from the cloud to 200 km at every silhouette
  // and along the horizon, so the old |previous - reconstructed| < 0.035 test
  // rejected history in a band along every edge, where the raw per-phase
  // reconstruction then changed with the phase every frame. Same rule as the
  // TSL twin (takramTslCloudPass.ts), measured there 2026-10-11.
  let lowMax = vec2i(textureDimensions(currentColour)) - 1;
  var moment1 = vec4f(0.0);
  var moment2 = vec4f(0.0);
  var depthMin = 1.0;
  var depthMax = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let at = clamp(lowPixel + vec2i(dx, dy), vec2i(0), lowMax);
      let colour = textureLoad(currentColour, at, 0);
      moment1 += colour;
      moment2 += colour * colour;
      let depthTap = textureLoad(currentDepth, at, 0).r;
      depthMin = min(depthMin, depthTap);
      depthMax = max(depthMax, depthTap);
    }
  }
  let mean = moment1 / 9.0;
  let halfWidth = sqrt(max(moment2 / 9.0 - mean * mean, vec4f(0.0))) * 1.25;
  let clampedColour = clamp(previousColour, mean - halfWidth, mean + halfWidth);
  let clampedDepth = clamp(previousDepthValue, depthMin, depthMax);
  let farHistory = smoothstep(0.20, 0.75, reconstructedDepth);
  let historyWeight = mix(0.82, 0.93, farHistory);
  let blendedColour = mix(freshColour, clampedColour, select(0.0, historyWeight, historyValid));
  let blendedDepth = mix(freshDepth, clampedDepth, select(0.0, historyWeight, historyValid));
  var out: TemporalOutput;
  out.colourOpacity = select(blendedColour, clampedColour, historyValid && !isCurrentPixel);
  out.cloudDepth = vec4f(select(blendedDepth, clampedDepth, historyValid && !isCurrentPixel), 0.0, 0.0, 1.0);
  return out;
}`

export const takramGameCompositeFragment = /* wgsl */ `
struct CompositeUniforms {
  resolutionNearFar: vec4f,
  cameraForwardFov: vec4f,
  cameraRightAspect: vec4f,
  cameraUpPad: vec4f,
}
@group(0) @binding(0) var<uniform> c: CompositeUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var cloudColour: texture_2d<f32>;
@group(0) @binding(3) var cloudDepth: texture_2d<f32>;
@group(0) @binding(4) var sceneColour: texture_2d<f32>;
@group(0) @binding(5) var sceneDepth: texture_depth_2d;

fn luminance(value: vec3f) -> f32 {
  return dot(value, vec3f(0.2126, 0.7152, 0.0722));
}
fn cameraRay(pixel: vec2f) -> vec3f {
  let ndc = pixel / c.resolutionNearFar.xy * 2.0 - 1.0;
  return normalize(c.cameraForwardFov.xyz + c.cameraRightAspect.xyz * ndc.x * c.cameraRightAspect.w * c.cameraForwardFov.w - c.cameraUpPad.xyz * ndc.y * c.cameraForwardFov.w);
}
fn cloudTap(uv: vec2f) -> vec4f {
  return textureSampleLevel(cloudColour, linearSampler, uv, 0.0);
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = c.resolutionNearFar.xy;
  let uv = position.xy / size;
  let texel = 1.0 / size;
  let centre = cloudTap(uv);
  let radius = texel * 3.0;
  let north = cloudTap(uv - vec2f(0.0, radius.y));
  let south = cloudTap(uv + vec2f(0.0, radius.y));
  let west = cloudTap(uv - vec2f(radius.x, 0.0));
  let east = cloudTap(uv + vec2f(radius.x, 0.0));
  let northWest = cloudTap(uv - radius);
  let northEast = cloudTap(uv + vec2f(radius.x, -radius.y));
  let southWest = cloudTap(uv + vec2f(-radius.x, radius.y));
  let southEast = cloudTap(uv + radius);
  let nearMin = min(centre.a, min(min(north.a, south.a), min(west.a, east.a)));
  let nearMax = max(centre.a, max(max(north.a, south.a), max(west.a, east.a)));
  let diagonalMin = min(min(northWest.a, northEast.a), min(southWest.a, southEast.a));
  let diagonalMax = max(max(northWest.a, northEast.a), max(southWest.a, southEast.a));
  let contrast = max(nearMax, diagonalMax) - min(nearMin, diagonalMin);
  var cloud = centre;
  if (contrast > 0.012) {
    let softEdge = (centre * 4.0 + (north + south + west + east) * 2.0 + northWest + northEast + southWest + southEast) / 16.0;
    let cloudDistance = textureSampleLevel(cloudDepth, linearSampler, uv, 0.0).r;
    let farResolve = smoothstep(0.20, 0.75, cloudDistance);
    let maxStrength = mix(0.90, 1.0, farResolve);
    let strength = min(maxStrength, (contrast - 0.012) / max(contrast, 1e-4) * 1.35);
    cloud = mix(centre, softEdge, strength);
  }
  let pixel = vec2i(position.xy);
  // The game renderer uses reversed floating-point depth (near=1, far=0).
  // Three's TSL depth helpers account for that through the backend; raw WGSL
  // sees the stored value and must convert it explicitly.
  let depth = 1.0 - textureLoad(sceneDepth, pixel, 0);
  let near = c.resolutionNearFar.z;
  let far = c.resolutionNearFar.w;
  let viewZ = (near * far) / ((far - near) * depth - far);
  let ray = cameraRay(position.xy);
  let sceneDistance = -viewZ / max(0.001, dot(ray, c.cameraForwardFov.xyz));
  let cloudDistance = textureSampleLevel(cloudDepth, linearSampler, uv, 0.0).r * 200000.0;
  let scene = textureLoad(sceneColour, pixel, 0);
  if (sceneDistance + 2.0 < cloudDistance) { return scene; }
  return vec4f(cloud.rgb + scene.rgb * (1.0 - cloud.a), scene.a);
}`

export function shaderModuleSource(fragment: string): string {
  return `${fullscreenVertex}\n${fragment}`
}
