"""Shared round-canopy builder for the F4 parachute assets. Original AGPL work.

Used by parachuting-person-rig, paratrooper-supply-bundle and m24-aircraft-parachute-flare
so all three read as the same WWII round (T-5 / G-1 / flare-chute style) canopy. The form is
an ellipsoidal bell: a rounded crown, maximum diameter just above the skirt, and a
tucked skirt whose hem rises in a scallop between gore seams. Every figure here is an ESTIMATE
chosen from photographs of round personnel and cargo canopies; no primary drawing was traced.
The cloth is a thin closed shell (outer and inner skin) so it is lit from below as well as above.
"""
import math

DEG = math.pi / 180.0
# Ring angles from the apex (degrees of the ellipse parameter). The last rings gather
# toward the hem so the scallop has several rows to bend.
PHIS = (0, 8, 17, 27, 38, 50, 63, 76, 88, 99, 107, 112)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _orient(verts, face, hint):
    """Return `face` wound so its normal points along `hint` (a point-dependent vector)."""
    p = [verts[i] for i in face]
    n = _cross(_sub(p[1], p[0]), _sub(p[2], p[0]))
    cx = sum(q[0] for q in p) / len(p)
    cy = sum(q[1] for q in p) / len(p)
    cz = sum(q[2] for q in p) / len(p)
    h = hint((cx, cy, cz))
    return tuple(face) if n[0] * h[0] + n[1] * h[1] + n[2] * h[2] >= 0 else tuple(reversed(face))


class Canopy:
    """Geometry of one canopy: surface points for ribs, hem points for suspension lines."""

    def __init__(self, base, radius, bell_height, gores, cols, bulge=.05, scallop=.07,
                 skirt=.87, phi_max=112.0):
        self.base, self.R, self.gores, self.cols = base, radius, gores, cols
        self.bulge, self.scallop = bulge, scallop
        self.a = radius                          # equator radius
        self.b = bell_height / (1 + math.sin((phi_max - 90) * DEG))  # vertical semi-axis
        self.phi_max = phi_max * DEG
        self.skirt = skirt

    def point(self, g, u, phi_deg, lift=0.0, pad=0.0):
        """Outer-surface point at gore g, fraction u (0 seam .. 1 next seam), ring angle phi."""
        phi = phi_deg * DEG
        env = math.sin(min(phi / self.phi_max, 1.0) * math.pi * .92)  # billow peaks mid-bell
        r = self.a * math.sin(phi) * (1 + self.bulge * math.sin(math.pi * u) * env) + pad
        y = self.base + self.b * (math.cos(phi) - math.cos(self.phi_max)) + lift
        th = 2 * math.pi * (g + u) / self.gores
        return (r * math.cos(th), y, r * math.sin(th))

    def hem(self, g):
        """Seam attachment point at the skirt (the low points of the scallop)."""
        return self.point(g, 0.0, self.phi_max / DEG)

    def seam(self, g, pad=.014):
        return [self.point(g, 0.0, p, pad=pad) for p in PHIS]

    def build(self, m, role, node, thickness=.014):
        n = self.gores * self.cols
        nr = len(PHIS)
        center = (0.0, self.base + self.b * .6, 0.0)
        verts = []
        # outer rings (ring 0 is the single apex vertex), then inner rings.
        for shell in (0, 1):
            for i, p in enumerate(PHIS):
                if i == 0:
                    verts.append(self.point(0, 0, 0, lift=-thickness * shell))
                    continue
                w = {nr - 1: 1.0, nr - 2: .55, nr - 3: .18}.get(i, 0.0)
                for k in range(n):
                    g, u = divmod(k, self.cols)
                    u /= self.cols
                    lift = self.scallop * math.sin(math.pi * u) * w
                    pt = self.point(g, u, p, lift=lift - thickness * shell, pad=-thickness * shell)
                    verts.append(pt)
        half = 1 + (nr - 1) * n

        def idx(shell, i, k):
            return shell * half + (0 if i == 0 else 1 + (i - 1) * n + k % n)

        out = lambda c: (c[0] - center[0], c[1] - center[1], c[2] - center[2])
        into = lambda c: (center[0] - c[0], center[1] - c[1], center[2] - c[2])
        faces = []
        for shell, hint in ((0, out), (1, into)):
            for k in range(n):
                faces.append(_orient(verts, (idx(shell, 0, 0), idx(shell, 1, k + 1), idx(shell, 1, k)), hint))
            for i in range(1, nr - 1):
                for k in range(n):
                    faces.append(_orient(verts, (idx(shell, i, k), idx(shell, i, k + 1),
                                                 idx(shell, i + 1, k + 1), idx(shell, i + 1, k)), hint))
        down = lambda c: (0.0, -1.0, 0.0)
        for k in range(n):
            faces.append(_orient(verts, (idx(0, nr - 1, k), idx(0, nr - 1, k + 1),
                                         idx(1, nr - 1, k + 1), idx(1, nr - 1, k)), down))
        m._part(role, verts, faces, node, None, True)

    def ribs(self, m, role, node, radius, sides=4):
        for g in range(self.gores):
            pts = self.seam(g)
            for p0, p1 in zip(pts, pts[1:]):
                m.strut(role, p0, p1, radius, sides=sides, node=node)
