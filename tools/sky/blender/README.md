# Blender spike: cloud volumes in and out (plan K, Task 1.1)

Both scripts run inside Blender's Python (has numpy and `openvdb`; the system
python3 has neither). Scratch goes to `out/` (gitignored). The Blender pin is
`BLENDER_VERSION` in `tools/models/blender/run.ts`; nothing here checks it, so
confirm `blender --version` first. Cycles CPU only (EEVEE is unusable headless).

Check, from the repo root (about 15 s on nexus). It stops at the first script that exits nonzero and
prints `blender-spike: ok` only if both passed; the ok lines are filtered for reading, the exit code
is Blender's own (`set -o pipefail`), not grep's:

    set -o pipefail; for s in roundtrip gn_volume_export; do blender -b --python tools/sky/blender/$s.py 2>&1 | grep -E '(roundtrip|gn-export):' || exit 1; done && echo blender-spike: ok

- `roundtrip.py`: `content/sky/cumulus.bin.gz` -> OpenVDB FloatGrid (`density`,
  voxel size 2 x `VOXEL_M`) -> read back and assert the uint8 volume is byte-exact
  -> Blender Volume + Principled Volume + sun, Cycles 256x256 -> assert > 0 covered
  (alpha > 0.02) pixels, PNG in `out/`.
- `gn_volume_export.py`: UV sphere -> Mesh to Volume -> geometry-nodes Bake node
  (disk) -> `.vdb` -> dense (125, 85, 153) numpy -> `out/gn_sphere.bin.gz` in the
  repo's layout. Asserts dims, active bbox inside the box, fill 0.10..0.25, readback.

Axis order: the shipped file is C-order `[z, y, x]` (x fastest); the VDB index is
`(x, y, z)` with no flip. The render rotates the object 90 degrees about X so the
game's y (up) is Blender's Z.

Traps hit (Blender 5.0.1, 2026-10-10):
- Principled Volume does NOT read a file volume's grid through its `Density Attribute`
  socket (default `density`): the render is empty, and a mesh-bounded volume still
  shows emission, so it looks like a camera bug. Wire an Attribute node (`density`)
  into `Density` instead.
- A new Bake node has no item; add one (`bake_items.new('GEOMETRY', 'Geometry')`) or
  the bake reports FINISHED and writes nothing. Set `bake_target = 'DISK'`.
- `openvdb.copyToArray` fills only inside the box you pass (`ijk=` is the box corner in
  index space); inactive voxels read as background 0.
- `Material.use_nodes` prints a deprecation warning (removed in 6.0); harmless now.
