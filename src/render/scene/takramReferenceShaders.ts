/**
 * Self-contained WGSL reference used by the production Takram adapter.
 * Kept separate so exact string anchors in takramGameShaders fail loudly
 * when this accepted baseline changes.
 */
export const fullscreenVertex = /* wgsl */ `
struct VertexOutput { @builtin(position) position: vec4f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  var points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VertexOutput;
  out.position = vec4f(points[index], 0.0, 1.0);
  return out;
}`

export const cloudsFragment = /* wgsl */ `
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
@group(0) @binding(1) var repeatSampler: sampler;
@group(0) @binding(2) var weatherTexture: texture_2d<f32>;
@group(0) @binding(3) var shapeTexture: texture_3d<f32>;
@group(0) @binding(4) var detailTexture: texture_3d<f32>;
@group(0) @binding(5) var turbulenceTexture: texture_2d<f32>;
@group(0) @binding(6) var stbnTexture: texture_3d<f32>;

struct FragmentOutput { @location(0) colourDepth: vec4f }
const PI = 3.141592653589793;

fn saturate(value: f32) -> f32 { return clamp(value, 0.0, 1.0); }
fn remap(value: f32, low: f32, high: f32) -> f32 {
  return saturate((value - low) / max(1e-6, high - low));
}
fn hg(g: f32, cosTheta: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / max(1e-7, 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}
fn phase(cosTheta: f32, attenuation: f32) -> f32 {
  return mix(hg(0.7 * attenuation, cosTheta), hg(-0.2 * attenuation, cosTheta), 0.5);
}
fn multipleScattering(opticalDepth: f32, cosTheta: f32) -> f32 {
  var coefficients = vec3f(1.0);
  var result = 0.0;
  for (var i = 0u; i < 8u; i += 1u) {
    result += coefficients.x * exp(-opticalDepth * coefficients.y) * phase(cosTheta, coefficients.z);
    coefficients *= 0.5;
  }
  return result;
}
fn rayDirection(pixel: vec2f) -> vec3f {
  let ndc = pixel / u.resolutionFrame.xy * 2.0 - 1.0;
  return normalize(
    u.cameraForwardFov.xyz +
    u.cameraRightAspect.xyz * ndc.x * u.cameraRightAspect.w * u.cameraForwardFov.w -
    u.cameraUpTime.xyz * ndc.y * u.cameraForwardFov.w
  );
}
fn layerInterval(originY: f32, directionY: f32, low: f32, high: f32) -> vec2f {
  if (abs(directionY) < 1e-6) {
    return select(vec2f(1.0, -1.0), vec2f(0.0, 200000.0), originY >= low && originY <= high);
  }
  let a = (low - originY) / directionY;
  let b = (high - originY) / directionY;
  return vec2f(max(0.0, min(a, b)), min(200000.0, max(a, b)));
}
fn toEcef(position: vec3f) -> vec3f {
  // Takram recentres WGS84 on its 6,360 km atmosphere sphere before all
  // weather and shape lookups. This is the reference correction at the
  // scripted path's 1,600 m start altitude.
  let origin = vec3f(-5896194.33, 2146039.23, -1038753.12);
  let north = vec3f(-0.1534762, 0.05586077, 0.98657216);
  let up = vec3f(-0.92707458, 0.33742755, -0.16332596);
  let east = vec3f(-0.34202014, -0.93969262, 0.0);
  return origin + north * position.x + up * position.y + east * position.z;
}
fn cubeSphereUv(position: vec3f) -> vec2f {
  let n = normalize(position);
  let f = abs(n);
  let c = n / max(f.x, max(f.y, f.z));
  var m: vec2f;
  if (f.y > f.x && f.y > f.z) {
    m = select(n.xz, vec2f(-n.x, n.z), c.y > 0.0);
  } else if (f.x > f.y && f.x > f.z) {
    m = select(vec2f(-n.y, n.z), n.yz, c.x > 0.0);
  } else {
    m = select(vec2f(n.x, -n.y), n.xy, c.z > 0.0);
  }
  let m2 = m * m;
  let q = dot(m2, vec2f(-2.0, 2.0)) - 3.0;
  let x = sqrt(max(0.0, 1.5 + m2.x - m2.y - 0.5 * sqrt(max(0.0, -24.0 * m2.x + q * q)))) * select(-1.0, 1.0, m.x > 0.0);
  let y = sqrt(max(0.0, 6.0 / (3.0 - x * x))) * m.y;
  return vec2f(x, y) * 0.5 + 0.5;
}
fn weatherUv(position: vec3f) -> vec2f {
  return cubeSphereUv(toEcef(position)) * 100.0;
}
fn hash32(value: u32) -> u32 {
  var hash = value;
  hash = (hash ^ (hash >> 16u)) * 0x7feb352du;
  hash = (hash ^ (hash >> 15u)) * 0x846ca68bu;
  return hash ^ (hash >> 16u);
}
fn weatherTileOffset(tile: vec2i) -> vec2f {
  if (all(tile == vec2i(0))) { return vec2f(0.0); }
  let seed = hash32(
    (bitcast<u32>(tile.x) * 0x9e3779b1u) ^ (bitcast<u32>(tile.y) * 0x85ebca77u));
  return vec2f(
    f32(hash32(seed ^ 0x68bc21ebu) & 0xffffu),
    f32(hash32(seed ^ 0x02e5be93u) & 0xffffu)
  ) / 65536.0 * 127.0;
}
fn weatherTile(position: vec3f, tile: vec2i, mipLevel: f32) -> vec4f {
  return textureSampleLevel(
    weatherTexture, repeatSampler, weatherUv(position) + weatherTileOffset(tile), mipLevel);
}
fn continuousWeather(position: vec3f, mipLevel: f32) -> vec4f {
  // Each 62-mile tile owns its centre 50 miles outright and cross-fades over
  // the final 6 miles on either side. The origin tile has no offset, preserving
  // the approved flight path; every other tile is a seeded view of the same
  // Takram weather basis. The blend is symmetric across the exact boundary.
  let coordinate = position.xz / 100000.0;
  let centre = vec2i(floor(coordinate + 0.5));
  let local = coordinate - vec2f(centre);
  var low = centre;
  var high = centre;
  var weight = vec2f(0.0);
  if (local.x > 0.4) {
    high.x += 1;
    weight.x = 0.5 * smoothstep(0.4, 0.5, local.x);
  } else if (local.x < -0.4) {
    low.x -= 1;
    weight.x = 0.5 + 0.5 * smoothstep(-0.5, -0.4, local.x);
  }
  if (local.y > 0.4) {
    high.y += 1;
    weight.y = 0.5 * smoothstep(0.4, 0.5, local.y);
  } else if (local.y < -0.4) {
    low.y -= 1;
    weight.y = 0.5 + 0.5 * smoothstep(-0.5, -0.4, local.y);
  }
  let lowLow = weatherTile(position, low, mipLevel);
  if (all(low == high)) { return lowLow; }
  if (low.x == high.x) {
    return mix(lowLow, weatherTile(position, vec2i(low.x, high.y), mipLevel), weight.y);
  }
  if (low.y == high.y) {
    return mix(lowLow, weatherTile(position, vec2i(high.x, low.y), mipLevel), weight.x);
  }
  let highLow = weatherTile(position, vec2i(high.x, low.y), mipLevel);
  let lowHigh = weatherTile(position, vec2i(low.x, high.y), mipLevel);
  let highHigh = weatherTile(position, high, mipLevel);
  return mix(mix(lowLow, highLow, weight.x), mix(lowHigh, highHigh, weight.x), weight.y);
}
fn heightShape(heightFraction: f32) -> f32 {
  let x = clamp(pow(heightFraction, 0.35) * 2.0 - 1.0, -1.0, 1.0);
  return 1.0 - x * x;
}
fn layerDensity(position: vec3f, layer: u32, weatherMip: f32, shapeMip: f32, jitter: f32) -> f32 {
  var low = 750.0;
  var high = 1400.0;
  var densityScale = 0.2;
  var shapeAmount = 1.0;
  var detailAmount = 1.0;
  if (layer == 1u) { low = 1000.0; high = 2200.0; }
  if (layer == 2u) {
    low = 7500.0; high = 8000.0; densityScale = 0.003; shapeAmount = 0.4; detailAmount = 0.0;
  }
  let h = remap(position.y, low, high);
  if (position.y <= low || position.y >= high) { return 0.0; }
  let uv = weatherUv(position);
  let weatherSample = continuousWeather(position, weatherMip);
  var localWeather = weatherSample.x;
  if (layer == 1u) { localWeather = weatherSample.y; }
  if (layer == 2u) { localWeather = weatherSample.z; }
  let width = select(0.6, 0.5, layer == 2u);
  let factor = 1.0 - u.cameraPositionCoverage.w * heightShape(h);
  var density = remap(mix(localWeather, 1.0, width), factor, factor + width);
  if (density <= 0.00001) { return 0.0; }
  let turbulenceUv = uv * 20.0;
  let turbulenceStrength = remap(h, 0.3, 0.0) * density;
  let turbulence = (textureSampleLevel(turbulenceTexture, repeatSampler, turbulenceUv, 0.0).xyz * 2.0 - 1.0) * 350.0 * turbulenceStrength;
  let ecef = toEcef(position);
  let shape = textureSampleLevel(shapeTexture, repeatSampler, (ecef + turbulence) * 0.0003, shapeMip).r;
  density = remap(density, (1.0 - shape) * shapeAmount, 1.0);
  if (detailAmount > 0.0 && jitter < 0.94) {
    let detail = textureSampleLevel(detailTexture, repeatSampler, (ecef + turbulence) * 0.006, 0.0).r;
    let modifier = mix(pow(detail, 6.0), 1.0 - detail, remap(h, 0.2, 0.4)) * detailAmount;
    density = remap(density * 2.0, modifier * 0.5, 1.0);
  }
  return saturate(density * densityScale * (0.75 * h + 0.25));
}
fn mediaDensity(position: vec3f, weatherMip: f32, shapeMip: f32, jitter: f32) -> f32 {
  return layerDensity(position, 0u, weatherMip, shapeMip, jitter) + layerDensity(position, 1u, weatherMip, shapeMip, jitter);
}
fn opticalDepthToSun(position: vec3f, weatherMip: f32, shapeMip: f32, jitter: f32) -> f32 {
  var opticalDepth = 0.0;
  var distance = 100.0 * jitter;
  var stepSize = 100.0;
  // High preset performs two fine sun samples; the cascaded shadow map carries
  // the long-distance remainder in Takram. The initial port deliberately keeps
  // this local term exact and substitutes a soft long-range attenuation below.
  for (var i = 0u; i < 2u; i += 1u) {
    opticalDepth += mediaDensity(position + u.sunDirectionExposure.xyz * distance, weatherMip, shapeMip, jitter) * stepSize;
    distance += stepSize;
    stepSize *= 1.75;
  }
  return opticalDepth;
}
fn sky(direction: vec3f) -> vec3f {
  let horizon = pow(saturate(1.0 - abs(direction.y)), 5.0);
  let zenith = saturate(direction.y * 0.5 + 0.5);
  var colour = mix(vec3f(0.38, 0.58, 0.82), vec3f(0.07, 0.25, 0.65), zenith);
  colour += vec3f(0.10, 0.08, 0.04) * horizon;
  let sun = pow(max(dot(direction, u.sunDirectionExposure.xyz), 0.0), 900.0);
  return colour + vec3f(12.0, 9.0, 5.5) * sun;
}

@fragment fn fragmentMain(@builtin(position) position: vec4f) -> FragmentOutput {
  let frame = u32(u.resolutionFrame.z);
  var phaseOffsets = array<vec2f, 6>(
    vec2f(0.5, 0.5), vec2f(1.5, 2.5), vec2f(0.5, 1.5),
    vec2f(1.5, 0.5), vec2f(0.5, 2.5), vec2f(1.5, 1.5)
  );
  let fullPixel = floor(position.xy) * vec2f(2.0, 3.0) + phaseOffsets[frame % 6u];
  let direction = rayDirection(fullPixel);
  let origin = u.cameraPositionCoverage.xyz;
  let noiseSize = vec3f(textureDimensions(stbnTexture));
  let jitterPixel = vec2u(fullPixel);
  let jitterSlice = hash32(jitterPixel.x ^ (jitterPixel.y * 0x9e3779b1u)) % u32(noiseSize.z);
  let jitter = textureSampleLevel(stbnTexture, repeatSampler, vec3f(fullPixel, f32(jitterSlice)) / noiseSize, 0.0).r;
  var colour = sky(direction);
  var transmittanceIntegral = 1.0;
  var radianceIntegral = vec3f(0.0);
  var weightedDistance = 0.0;
  var weightSum = 0.0;
  // The thin 7.5 km layer is evaluated as a footprint-filtered slab. Marching
  // four or five discrete steps through it creates visible altitude contours;
  // the analytic path average is the same density integral without the rings.
  if (direction.y > 0.001) {
    let highDistance = (7750.0 - origin.y) / direction.y;
    if (highDistance > 0.0 && highDistance < 200000.0) {
      let highPosition = origin + direction * highDistance;
      let highDensity = layerDensity(highPosition, 2u, 2.0, 2.0, jitter);
      let highPath = min(12000.0, 500.0 / max(0.05, direction.y));
      let horizonFade = smoothstep(0.025, 0.12, direction.y);
      let highOpacity = (1.0 - exp(-highDensity * highPath)) * 0.72 * horizonFade;
      colour = mix(colour, vec3f(1.15, 1.22, 1.34), highOpacity);
    }
  }
  let lowInterval = layerInterval(origin.y, direction.y, 750.0, 2200.0);
  var nearDistance = 200000.0;
  var farDistance = 0.0;
  if (lowInterval.y > lowInterval.x) { nearDistance = min(nearDistance, lowInterval.x); farDistance = max(farDistance, lowInterval.y); }
  if (farDistance > nearDistance) {
    var stepSize = 50.0 + 0.01 * nearDistance;
    var distance = nearDistance + stepSize * jitter * 2.0;
    let cosTheta = dot(direction, u.sunDirectionExposure.xyz);
    for (var i = 0u; i < 500u; i += 1u) {
      if (distance > farDistance || distance > 200000.0 || transmittanceIntegral <= 0.01) { break; }
      let samplePosition = origin + direction * distance;
      let inLayer = samplePosition.y > 750.0 && samplePosition.y < 2200.0;
      if (!inLayer) { distance += 1000.0; continue; }
      let weatherMip = log2(max(1.0, distance * 1e-5));
      // One source voxel spans about 26 m in world space. Filter against both
      // the current 2x3 temporal sample footprint and half a march interval;
      // the precomputed mip is an average, never eight runtime neighbours.
      let rayFootprint = distance * 6.0 * u.cameraForwardFov.w / u.resolutionFrame.y;
      let filterWidth = max(rayFootprint, stepSize * 0.5);
      let shapeMip = clamp(log2(max(1.0, filterWidth / 26.0416667)), 0.0, 7.0);
      var density = mediaDensity(samplePosition, weatherMip, shapeMip, jitter);
      // The flat-layer interval extends beyond the 200 km march limit near the
      // horizon. Fade over the final 50 km so the limit cannot become a hard,
      // temporally sampled rendering edge.
      density *= 1.0 - smoothstep(150000.0, 198000.0, distance);
      if (density <= 0.00001) {
        stepSize = min(1000.0, stepSize * 1.01);
        distance += stepSize;
        continue;
      }
      let opticalDepth = opticalDepthToSun(samplePosition, weatherMip, shapeMip, jitter);
      let sunIrradiance = vec3f(13.5, 12.8, 11.8);
      let skyIrradiance = vec3f(2.2, 2.8, 4.0);
      var radiance = sunIrradiance * multipleScattering(opticalDepth, cosTheta);
      let h = remap(samplePosition.y, 750.0, 2200.0);
      radiance += skyIrradiance * (0.5 + 0.5 * h) / (4.0 * PI);
      radiance += vec3f(0.24, 0.27, 0.30) * (1.0 - h);
      radiance *= density;
      radiance *= 1.0 - 0.8 * exp(-density * 150.0);
      let segmentTransmittance = exp(-density * stepSize);
      let scatteringIntegral = radiance * (1.0 - segmentTransmittance) / max(density, 1e-7);
      radianceIntegral += transmittanceIntegral * scatteringIntegral;
      transmittanceIntegral *= segmentTransmittance;
      weightedDistance += distance * transmittanceIntegral;
      weightSum += transmittanceIntegral;
      stepSize = min(1000.0, stepSize * 1.01);
      distance += stepSize;
    }
    colour = radianceIntegral + colour * transmittanceIntegral;
  }
  let frontDepth = select(200000.0, weightedDistance / max(weightSum, 1e-6), weightSum > 0.0);
  var out: FragmentOutput;
  out.colourDepth = vec4f(colour * 0.1, frontDepth / 200000.0);
  return out;
}`

export const temporalFragment = /* wgsl */ `
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
@group(0) @binding(2) var currentTexture: texture_2d<f32>;
@group(0) @binding(3) var historyTexture: texture_2d<f32>;

fn currentRay(pixel: vec2f) -> vec3f {
  let ndc = pixel / u.resolutionFrame.xy * 2.0 - 1.0;
  return normalize(u.cameraForwardFov.xyz + u.cameraRightAspect.xyz * ndc.x * u.cameraRightAspect.w * u.cameraForwardFov.w - u.cameraUpTime.xyz * ndc.y * u.cameraForwardFov.w);
}
@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var phaseOffsets = array<vec2u, 6>(
    vec2u(0, 0), vec2u(1, 2), vec2u(0, 1),
    vec2u(1, 0), vec2u(0, 2), vec2u(1, 1)
  );
  let pixel = vec2u(position.xy);
  let phase = u32(u.resolutionFrame.z) % 6u;
  let phaseCentre = vec2f(phaseOffsets[phase]) + 0.5;
  let phaseScale = vec2f(2.0, 3.0);
  let lowSize = vec2f(textureDimensions(currentTexture));
  let reconstructedUv = ((position.xy - phaseCentre) / phaseScale + 0.5) / lowSize;
  let reconstructed = textureSampleLevel(currentTexture, linearSampler, reconstructedUv, 0.0);
  let exactCurrent = textureLoad(currentTexture, vec2i(pixel / vec2u(2u, 3u)), 0);
  let distance = reconstructed.a * 200000.0;
  let world = u.cameraPositionCoverage.xyz + currentRay(position.xy) * distance;
  let relative = world - u.previousPositionValid.xyz;
  let z = dot(relative, u.previousForwardFov.xyz);
  let previousNdc = vec2f(
    dot(relative, u.previousRightAspect.xyz) / max(1.0, z * u.previousForwardFov.w * u.previousRightAspect.w),
    -dot(relative, u.previousUp.xyz) / max(1.0, z * u.previousForwardFov.w)
  );
  let previousUv = previousNdc * 0.5 + 0.5;
  let validUv = all(previousUv > vec2f(0.002)) && all(previousUv < vec2f(0.998)) && z > 0.0;
  let history = textureSampleLevel(historyTexture, linearSampler, previousUv, 0.0);
  let depthAgreement = abs(history.a - reconstructed.a) < 0.035;
  let historyValid = u.previousPositionValid.w > 0.5 && validUv && depthAgreement;
  let isCurrentPixel = all((pixel % vec2u(2u, 3u)) == phaseOffsets[phase]);
  let fresh = select(reconstructed, exactCurrent, isCurrentPixel);
  // Distant cloud parallax is tiny, so retain more reprojected history there
  // to suppress phase shimmer without adding near-field motion trails.
  let farHistory = smoothstep(0.20, 0.75, reconstructed.a);
  let historyWeight = mix(0.82, 0.93, farHistory);
  let accumulatedCurrent = mix(fresh, history, select(0.0, historyWeight, historyValid));
  return select(accumulatedCurrent, history, historyValid && !isCurrentPixel);
}`

export const presentFragment = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn agx(value: vec3f) -> vec3f {
  let srgbToRec2020 = mat3x3f(
    vec3f(0.6274, 0.0691, 0.0164), vec3f(0.3293, 0.9195, 0.0880), vec3f(0.0433, 0.0113, 0.8956));
  let inset = mat3x3f(
    vec3f(0.85662715, 0.13731897, 0.11189821), vec3f(0.09512124, 0.76124199, 0.07679942), vec3f(0.04825161, 0.10143904, 0.81130237));
  let outset = mat3x3f(
    vec3f(1.12710058, -0.14132976, -0.14132976), vec3f(-0.11060664, 1.15782370, -0.11060664), vec3f(-0.01649394, -0.01649394, 1.25193641));
  let rec2020ToSrgb = mat3x3f(
    vec3f(1.6605, -0.1246, -0.0182), vec3f(-0.5876, 1.1329, -0.1006), vec3f(-0.0728, -0.0083, 1.1187));
  var colour = inset * (srgbToRec2020 * (value * 10.0));
  colour = clamp((log2(max(colour, vec3f(1e-10))) + 12.47393) / 16.5, vec3f(0.0), vec3f(1.0));
  colour = outset * agxContrast(colour);
  colour = rec2020ToSrgb * pow(max(colour, vec3f(0.0)), vec3f(2.2));
  return clamp(colour, vec3f(0.0), vec3f(1.0));
}
fn luminance(colour: vec3f) -> f32 {
  return dot(colour, vec3f(0.2126, 0.7152, 0.0722));
}
@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(sourceTexture));
  let uv = position.xy / size;
  let texel = 1.0 / size;
  let centreSample = textureSampleLevel(sourceTexture, linearSampler, uv, 0.0);
  let centre = centreSample.rgb;
  let radius = texel * 3.0;
  let north = textureSampleLevel(sourceTexture, linearSampler, uv - vec2f(0.0, radius.y), 0.0).rgb;
  let south = textureSampleLevel(sourceTexture, linearSampler, uv + vec2f(0.0, radius.y), 0.0).rgb;
  let west = textureSampleLevel(sourceTexture, linearSampler, uv - vec2f(radius.x, 0.0), 0.0).rgb;
  let east = textureSampleLevel(sourceTexture, linearSampler, uv + vec2f(radius.x, 0.0), 0.0).rgb;
  let northWest = textureSampleLevel(sourceTexture, linearSampler, uv - radius, 0.0).rgb;
  let northEast = textureSampleLevel(sourceTexture, linearSampler, uv + vec2f(radius.x, -radius.y), 0.0).rgb;
  let southWest = textureSampleLevel(sourceTexture, linearSampler, uv + vec2f(-radius.x, radius.y), 0.0).rgb;
  let southEast = textureSampleLevel(sourceTexture, linearSampler, uv + radius, 0.0).rgb;
  let lumaCentre = luminance(centre);
  let nearMin = min(lumaCentre, min(min(luminance(north), luminance(south)), min(luminance(west), luminance(east))));
  let nearMax = max(lumaCentre, max(max(luminance(north), luminance(south)), max(luminance(west), luminance(east))));
  let diagonalMin = min(min(luminance(northWest), luminance(northEast)), min(luminance(southWest), luminance(southEast)));
  let diagonalMax = max(max(luminance(northWest), luminance(northEast)), max(luminance(southWest), luminance(southEast)));
  let lumaMin = min(nearMin, diagonalMin);
  let lumaMax = max(nearMax, diagonalMax);
  let contrast = lumaMax - lumaMin;
  let threshold = max(0.008, lumaMax * 0.035);
  var linear = centre;
  if (contrast > threshold) {
    // A broad nine-tap Gaussian deliberately trades fine edge wisps for a
    // coherent soft silhouette. The three-pixel offsets span a roughly
    // seven-pixel feather once bilinear sampling is included.
    let softEdge = (
      centre * 4.0 +
      (north + south + west + east) * 2.0 +
      northWest + northEast + southWest + southEast
    ) / 16.0;
    let farResolve = smoothstep(0.20, 0.75, centreSample.a);
    let maxStrength = mix(0.90, 1.0, farResolve);
    let strength = min(maxStrength, (contrast - threshold) / max(contrast, 1e-4) * 1.35);
    linear = mix(centre, softEdge, strength);
  }
  return vec4f(pow(agx(linear), vec3f(1.0 / 2.2)), 1.0);
}`
