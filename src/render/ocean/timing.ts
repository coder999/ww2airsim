/** Native compute timestamps; render-pass timestamps exclude this work. */
export function computeTimer(device: GPUDevice) {
  const samples: number[] = []
  const querySet = device.features.has('timestamp-query') ? device.createQuerySet({type:'timestamp',count:2}) : undefined
  const resolve = querySet ? device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}) : undefined
  const read = querySet ? device.createBuffer({size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}) : undefined
  let pending = false
  let generation = 0
  let disposed = false
  // The most recent measured dispatch, kept across `reset()` on purpose: it
  // is what main.ts adds to each GPU frame sample so `gpuFrameTimesMs`
  // counts compute (photoreal Task 2, 2026-09-24), and a window reset does
  // not make the last measurement of the same dispatch any less current.
  let latest: number | undefined
  return {
    samples: () => samples.slice(),
    latest: () => latest,
    reset: () => { samples.length = 0; generation++ },
    begin(): GPUComputePassDescriptor {
      return querySet && !pending && !disposed && samples.length < 4096 ? {timestampWrites:{querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}} : {}
    },
    end(encoder: GPUCommandEncoder, descriptor: GPUComputePassDescriptor): (() => void) | undefined {
      if (!descriptor.timestampWrites || !querySet || !resolve || !read) return undefined
      encoder.resolveQuerySet(querySet,0,2,resolve,0)
      encoder.copyBufferToBuffer(resolve,0,read,0,16)
      pending = true
      const epoch = generation
      return () => {
        void read.mapAsync(GPUMapMode.READ).then(() => {
          const times = new BigUint64Array(read.getMappedRange())
          const ms = Number(times[1]! - times[0]!) / 1e6
          if (!disposed) latest = ms
          if (!disposed && epoch === generation && samples.length < 4096) samples.push(ms)
          read.unmap()
        }).catch(() => { /* device loss is reported by the renderer */ }).finally(() => { pending = false })
      }
    },
    dispose() { disposed = true; querySet?.destroy(); resolve?.destroy(); read?.destroy() },
  }
}
