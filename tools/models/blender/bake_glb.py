"""(M1d) Bakes a downloaded ship: bake.py's run() on a glb the build wrote, not on a kit script's scene.
Original work, AGPL-3.0-or-later.

tools/models/bake.ts runs this in Ryzen's Windows Blender:
    blender -b --factory-startup -P bake_glb.py -- <bake input .glb> <detail .json> <out dir> <atlas px>
The glb is the box-skinned download's skinned nodes after projection (build.ts's bakeInput), so its UVs
are the atlas; the json is skin/downloadDetail.ts's detail list. glTF import turns +y up into Blender's
+z up exactly as kit.export does the reverse, so bake.py's model-to-Blender conversion holds.
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake  # noqa: E402

glb, detail, out, size = sys.argv[sys.argv.index('--') + 1:]
for o in list(bpy.data.objects):  # the factory scene's cube, camera and light
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
with open(detail, encoding='utf-8') as fh:
    details = json.load(fh)
bake.run(details, out, int(size), two_sided=True)
