"""cumulus.bin.gz -> OpenVDB -> byte-exact readback -> Cycles render.

  blender -b --python tools/sky/blender/roundtrip.py

Runs inside Blender's Python (has numpy and `openvdb`); system python cannot.
"""
import gzip
import os
import sys

import bpy
import numpy as np
import openvdb

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

# CUMULUS_DIMS in src/render/sky/noise.ts (x, y, z).
NX, NY, NZ = 125, 85, 153
# tools/sky/cumulus.py: VOXEL_M = 1800/307, and main() box-filters 2x before shipping.
VOXEL_M = 1800.0 / 307 * 2


def ok(check):
    print(f'roundtrip: {check} ok', flush=True)


def fail(msg):
    print(f'roundtrip: FAIL {msg}', flush=True)
    sys.exit(1)


# a. cumulus.py writes u8.transpose(2, 1, 0): x fastest, i.e. C-order [z, y, x].
raw = gzip.decompress(open(os.path.join(ROOT, 'content/sky/cumulus.bin.gz'), 'rb').read())
if len(raw) != NX * NY * NZ:
    fail(f'inflated {len(raw)} bytes, expected {NX * NY * NZ}')
u8 = np.frombuffer(raw, np.uint8).reshape(NZ, NY, NX).transpose(2, 1, 0)  # -> [x, y, z]
ok('read cumulus.bin.gz')

# b. write density 0..1 as a FloatGrid.
def write_vdb(path, dense):
    g = openvdb.FloatGrid()
    g.name = 'density'
    g.transform = openvdb.createLinearTransform(VOXEL_M)
    g.copyFromArray(np.ascontiguousarray(dense, np.float32))
    openvdb.write(path, grids=[g])

vdb = os.path.join(OUT, 'cumulus.vdb')
write_vdb(vdb, u8.astype(np.float32) / 255.0)
ok(f'wrote {os.path.relpath(vdb, ROOT)}')

# c. read back, quantize exactly as cumulus.py does, compare.
g = openvdb.read(vdb, 'density')
back = np.zeros((NX, NY, NZ), np.float32)
g.copyToArray(back)
got = np.clip(back * 255 + 0.5, 0, 255).astype(np.uint8)
if not np.array_equal(got, u8):
    fail(f'{int((got != u8).sum())} voxels differ')
ok(f'uint8 byte-exact ({u8.size} voxels, {int((u8 > 0).sum())} nonzero)')


# d. Blender Volume + Principled Volume + Cycles CPU, sun lamp, 256x256.
def render(vdb_path, png, density_scale, cam_dist):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    vol = bpy.data.volumes.new('cloud')
    vol.filepath = vdb_path
    obj = bpy.data.objects.new('cloud', vol)
    sc.collection.objects.link(obj)
    obj.rotation_euler[0] = np.pi / 2  # VDB y (game up) -> Blender Z
    mat = bpy.data.materials.new('cloud')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    # Trap (5.0.1, verified 2026-10-10): a file volume's grid is NOT picked up through the Principled
    # Volume 'Density Attribute' socket (default 'density'); it renders as empty. Feed it explicitly.
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'density'
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = density_scale
    nt.links.new(at.outputs['Fac'], mul.inputs[0])
    nt.links.new(mul.outputs[0], pv.inputs['Density'])
    pv.inputs['Color'].default_value = (1, 1, 1, 1)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(pv.outputs['Volume'], outn.inputs['Volume'])
    obj.data.materials.append(mat)

    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.0
    sun.rotation_euler = (np.radians(50), 0, np.radians(30))
    sc.collection.objects.link(sun)

    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    # Rotated bbox is x 0..1465, y -1793..0, z 0..996 m; aim level at its center.
    cam.location = (NX * VOXEL_M / 2, -NZ * VOXEL_M / 2 - cam_dist, NY * VOXEL_M / 2)
    cam.rotation_euler = (np.pi / 2, 0, 0)
    cam.data.clip_end = 20000
    sc.collection.objects.link(cam)
    sc.camera = cam

    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = 256
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = png
    bpy.ops.render.render(write_still=True)

    img = bpy.data.images.load(png)
    px = np.array(img.pixels[:], np.float32).reshape(-1, 4)
    return int((px[:, 3] > 0.02).sum()), px.shape[0]


png = os.path.join(OUT, 'cumulus.png')
covered, total = render(vdb, png, 0.05, 3500)
if covered == 0:
    # Sanity: homogeneous solid-ish volume to separate scene bugs from density bugs.
    hv = os.path.join(OUT, 'homog.vdb')
    write_vdb(hv, np.ones((NX, NY, NZ), np.float32))
    c2, _ = render(hv, os.path.join(OUT, 'homog.png'), 0.05, 3500)
    fail(f'0 covered pixels (homogeneous sanity volume: {c2})')
ok(f'cycles render {covered}/{total} covered pixels -> {os.path.relpath(png, ROOT)}')
