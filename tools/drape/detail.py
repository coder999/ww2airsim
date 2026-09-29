"""Add synthetic sub-pixel canopy detail over the upscaled Sentinel base.

  detail.py <drape-synthsr-base.png> <out drape-synthsr.png>

The base is real ground at ~2.5 m of information; this layer only modulates
luminance (tree crowns in forest, faint mottling elsewhere), never hue or layout.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def fbm(shape, scales, weights, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, "float32")
    for s, w in zip(scales, weights):
        n = ndi.gaussian_filter(rng.standard_normal(shape).astype("float32"), s)
        out += w * n / (n.std() + 1e-6)
    return out / (sum(weights) ** 0.5)


def main(src, dst):
    a = np.asarray(Image.open(src).convert("RGB")).astype("float32")
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a @ np.array([0.2126, 0.7152, 0.0722], "float32")
    forest = np.clip((g - r * 1.02) / 14, 0, 1) * np.clip((150 - lum) / 60, 0, 1)
    forest = ndi.gaussian_filter(forest, 1.0)
    crowns = fbm(lum.shape, (0.9, 1.7, 3.5), (1, 1, 0.7), 7)
    mottle = fbm(lum.shape, (2.5, 9), (1, 1), 8)
    gain = 1 + forest * 0.16 * crowns + (1 - forest) * 0.05 * mottle
    out = np.clip(a * gain[..., None], 0, 255).astype("uint8")
    Image.fromarray(out).save(dst, optimize=True)
    print("wrote", dst, out.shape)


if __name__ == "__main__":
    main(*sys.argv[1:3])
