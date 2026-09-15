import { butterflyStages } from './butterfly.js'

/** Complete native WGSL modules, as in the working day-0 raw-device probe.
 * wgslFn accepts a function, not these module bindings/workgroup declarations.
 * The original plan confused that wrapper with the tested native-device path. */
export function fftKernelSource(n: number): string {
  const stages = butterflyStages(n)
  if (n > 256) throw new Error('ocean FFT: supported N is at most 256')
  // Derive spans from the shared tables and reject any unsupported table
  // edit, rather than silently diverging from the CPU's indexing.
  for (const { span, pairs } of stages) pairs.forEach((p, lane) => {
    const a = Math.floor(lane / span) * span * 2 + lane % span
    if (p.a !== a || p.b !== a + span || p.twiddleIndex !== lane % span * n / (span * 2)) {
      throw new Error('ocean FFT: reference butterfly table changed')
    }
  })
  return `
const N: u32 = ${n}u;
const STAGES: u32 = ${stages.length}u;
const SPANS = array<u32, ${stages.length}>(${stages.map((s) => `${s.span}u`).join(', ')});
struct Params { axis: u32, n: u32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<storage, read> sourceData: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> targetData: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> params: Params;
var<workgroup> scratch: array<vec2<f32>, ${n}>;
fn address(line: u32, i: u32, field: u32) -> u32 {
  if (params.axis == 0u) { return field*N*N + line*N + i; }
  return field*N*N + i*N + line;
}
@compute @workgroup_size(${n / 2})
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(workgroup_id) gid: vec3<u32>) {
  let lane = lid.x;
  let other = lane + N/2u;
  scratch[reverseBits(lane) >> (32u-STAGES)] = sourceData[address(gid.x, lane, gid.y)];
  scratch[reverseBits(other) >> (32u-STAGES)] = sourceData[address(gid.x, other, gid.y)];
  workgroupBarrier();
  for (var stage=0u; stage<STAGES; stage++) {
    let span = SPANS[stage];
    let a = (lane/span)*span*2u + lane%span;
    let b = a + span;
    let angle = 6.283185307179586 * f32(lane%span) / f32(2u*span);
    let w = vec2<f32>(cos(angle), sin(angle));
    let v = scratch[b];
    let t = vec2<f32>(w.x*v.x-w.y*v.y, w.y*v.x+w.x*v.y);
    let first = scratch[a];
    scratch[a] = first + t;
    scratch[b] = first - t;
    workgroupBarrier();
  }
  targetData[address(gid.x, lane, gid.y)] = scratch[lane];
  targetData[address(gid.x, other, gid.y)] = scratch[other];
}`
}

const PARAMS = 'struct Params { n: u32, patchM: f32, timeS: f32, deltaS: f32 }'
export function evolveKernelSource(): string {
  return `
${PARAMS}
const G: f32 = 9.81;
// Stationary h0 and k coordinates are uploaded from stationarySpectrum,
// including its shared seed and Box-Muller draw order. No second GPU RNG.
@group(0) @binding(0) var<storage, read> initial: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> evolved: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> params: Params;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let count = params.n * params.n;
  if (i >= count) { return; }
  let x = i % params.n;
  let z = i / params.n;
  let opposite = ((params.n-z)%params.n)*params.n + (params.n-x)%params.n;
  let a = initial[i];
  let b = initial[opposite];
  let k = length(a.zw);
  let phase = sqrt(G * k) * params.timeS;
  let c = cos(phase);
  let s = sin(phase);
  let h = vec2<f32>((a.x+b.x)*c-(a.y+b.y)*s, (a.x-b.x)*s+(a.y-b.y)*c);
  evolved[i] = h;
  var direction = vec2<f32>(0.0);
  if (k > 0.0) { direction = a.zw / k; }
  // Horizontal displacement is -i k/|k| h(k), unit choppiness.
  evolved[count+i] = vec2<f32>(h.y, -h.x) * direction.x;
  evolved[2u*count+i] = vec2<f32>(h.y, -h.x) * direction.y;
}`
}

/** Write displaced positions, geometric normals and Jacobian-derived foam. */
export function deriveKernelSource(): string {
  return `
${PARAMS}
@group(0) @binding(0) var<storage, read> transformed: array<vec2<f32>>;
@group(0) @binding(1) var displacement: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var normals: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var foam: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var<storage, read_write> history: array<f32>;
@group(0) @binding(5) var<uniform> params: Params;
fn sampleAt(x: u32, z: u32) -> vec3<f32> {
  let count = params.n*params.n;
  let i = (z%params.n)*params.n + x%params.n;
  return vec3<f32>(transformed[count+i].x, transformed[i].x, transformed[2u*count+i].x);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let z = gid.y; let n = params.n;
  if (x >= n || z >= n) { return; }
  let stepM = params.patchM / f32(n);
  let dx = (sampleAt(x+1u,z)-sampleAt(x+n-1u,z))/(2.0*stepM);
  let dz = (sampleAt(x,z+1u)-sampleAt(x,z+n-1u))/(2.0*stepM);
  let normal = normalize(cross(vec3<f32>(dz.x,dz.y,1.0+dz.z), vec3<f32>(1.0+dx.x,dx.y,dx.z)));
  let jacobian = (1.0+dx.x)*(1.0+dz.z)-dz.x*dx.z;
  let i = z*n+x;
  // Two-second exponential persistence is a visual foam lifetime, not a
  // calibrated physical parameter. Only a negative Jacobian creates foam.
  let amount = max(history[i]*exp(-params.deltaS/2.0), clamp(-jacobian,0.0,1.0));
  history[i] = amount;
  let coord = vec2<i32>(i32(x),i32(z));
  textureStore(displacement,coord,vec4<f32>(sampleAt(x,z),1.0));
  textureStore(normals,coord,vec4<f32>(normal,jacobian));
  textureStore(foam,coord,vec4<f32>(amount,amount,amount,1.0));
}`
}
