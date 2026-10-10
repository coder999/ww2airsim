"""Procedural Blender volume -> geometry-nodes Bake (.vdb on disk) -> repo uint8 .bin.gz.

  blender -b --python tools/sky/blender/gn_volume_export.py

The reverse of roundtrip.py: how a Blender-authored volume reaches content/sky/.
Route that works in 5.0.1 headless: Mesh to Volume + Bake node (bake_target DISK) +
bpy.ops.object.geometry_node_bake_single, then read blobs/*.vdb with `openvdb`.
"""
import glob
import gzip
import os
import shutil
import sys

import bmesh
import bpy
import numpy as np
import openvdb

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
BAKE = os.path.join(OUT, 'gn_bake')
BIN = os.path.join(OUT, 'gn_sphere.bin.gz')
DIMS = (125, 85, 153)  # (x, y, z): same shape as CUMULUS_DIMS in src/render/sky/noise.ts
VOXEL = 0.125          # sphere radius 5 -> 40 voxels, which fits inside DIMS


def ok():
    print('gn-export: ok', flush=True)


def fail(msg):
    print(f'gn-export: FAIL {msg}', flush=True)
    sys.exit(1)


shutil.rmtree(BAKE, ignore_errors=True)
os.makedirs(BAKE)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.frame_start = sc.frame_end = 1
me = bpy.data.meshes.new('sphere')
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=5.0)
bm.to_mesh(me)
obj = bpy.data.objects.new('sphere', me)
sc.collection.objects.link(obj)

ng = bpy.data.node_groups.new('gn_volume', 'GeometryNodeTree')
ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
gin, gout = ng.nodes.new('NodeGroupInput'), ng.nodes.new('NodeGroupOutput')
mv = ng.nodes.new('GeometryNodeMeshToVolume')
mv.inputs['Resolution Mode'].default_value = 'Size'
mv.inputs['Voxel Size'].default_value = VOXEL
mv.inputs['Density'].default_value = 1.0
bake = ng.nodes.new('GeometryNodeBake')
bake.bake_items.new('GEOMETRY', 'Geometry')  # a fresh Bake node has no item, and the bake silently writes nothing
ng.links.new(gin.outputs[0], mv.inputs['Mesh'])
ng.links.new(mv.outputs[0], bake.inputs[0])
ng.links.new(bake.outputs[0], gout.inputs[0])

mod = obj.modifiers.new('gn', 'NODES')
mod.node_group = ng
mod.bake_directory = BAKE
b = mod.bakes[0]
b.bake_mode = 'STILL'
b.bake_target = 'DISK'
bpy.context.view_layer.objects.active = obj
if bpy.ops.object.geometry_node_bake_single(session_uid=obj.session_uid, modifier_name=mod.name, bake_id=b.bake_id) != {'FINISHED'}:
    fail('bake op did not finish')

vdbs = glob.glob(os.path.join(BAKE, '**', '*.vdb'), recursive=True)
if len(vdbs) != 1:
    fail(f'expected 1 baked .vdb, found {vdbs}')
grids = openvdb.readAll(vdbs[0])[0]
g = next((x for x in grids if x.name == 'density'), None)
if g is None:
    fail(f'no density grid, got {[x.name for x in grids]}')

# Dense box centered on index (0,0,0), the sphere's center.
dense = np.zeros(DIMS, np.float32)
g.copyToArray(dense, ijk=tuple(-(d // 2) for d in DIMS))
u8 = np.clip(dense * 255 + 0.5, 0, 255).astype(np.uint8)
fill = float((u8 > 0).mean())
# Active region must lie inside the box, else we cropped the volume.
lo, hi = g.evalActiveVoxelBoundingBox()
if any(l < -(d // 2) or h >= d - d // 2 for l, h, d in zip(lo, hi, DIMS)):
    fail(f'active bbox {lo}..{hi} exceeds dims {DIMS}')
# Sphere r=5 at voxel 0.125 is 4/3*pi*40^3 voxels of a 125*85*153 box = 16%.
if not 0.10 < fill < 0.25:
    fail(f'fill fraction {fill:.3f} outside 0.10..0.25')

# Same layout as cumulus.py: x fastest, i.e. C-order [z, y, x].
with open(BIN, 'wb') as f:
    f.write(gzip.compress(u8.transpose(2, 1, 0).tobytes(), compresslevel=9, mtime=0))
back = np.frombuffer(gzip.decompress(open(BIN, 'rb').read()), np.uint8).reshape(DIMS[2], DIMS[1], DIMS[0]).transpose(2, 1, 0)
if not np.array_equal(back, u8):
    fail('bin.gz readback differs')
print(f'gn-export: dims {DIMS}, fill {fill:.3f}, max {u8.max()}, active bbox {lo}..{hi}, -> {os.path.relpath(BIN, HERE)}', flush=True)
ok()
