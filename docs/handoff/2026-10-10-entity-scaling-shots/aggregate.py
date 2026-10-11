"""Aggregates entity-scaling.jsonl rows (median over repeats) into markdown tables."""
import json, sys, statistics
from collections import defaultdict

rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
groups = defaultdict(list)
for r in rows:
    if 'frozen' not in r:
        continue
    groups[(r['layout'], r['aircraft'], r['ships'], r['tier'], r['params'])].append(r)

def med(rs, f):
    return statistics.median([f(r) for r in rs])

def f2(x, d=2):
    return f'{x:.{d}f}'

order = lambda k: (k[0] != 'tight', k[3] != 'high', k[4], k[2] > 0 and k[1] > 0, k[1], k[2])
ns = sorted({len(v) for v in groups.values()})
print(f'repeats per point: {ns}\n')
print('### GPU, 1440p High, frozen (paused, swarm in place)\n')
print('| Layout | Aircraft | Ships | Aircraft in view | Ships in view | GPU p50 | GPU p95 | Draw calls | Triangles (k) | Work p50 (paused) | n |')
print('| --- ' * 11 + '|')
for k in sorted(groups, key=order):
    if k[3] != 'high' or k[4] != '':
        continue
    rs = groups[k]
    fz = lambda g: (lambda r: g(r['frozen']))
    print(f"| {k[0]} | {k[1]} | {k[2]} | {med(rs, fz(lambda w: w['inView'])):.0f} | {med(rs, fz(lambda w: w['shipsInView'])):.0f} | {f2(med(rs, fz(lambda w: w['gpuP50'])))} | {f2(med(rs, fz(lambda w: w['gpuP95'])))} | {med(rs, fz(lambda w: w['drawCalls'])):.0f} | {med(rs, fz(lambda w: w['triangles']))/1000:.0f} | {f2(med(rs, fz(lambda w: w['workP50'])),1)} | {len(rs)} |")

print('\n### CPU and sim, 1440p High, live\n')
print('| Layout | Aircraft | Ships | In view (1x end) | Work p50 | Work p95 | Sim ms/tick | 3x work p50 | 3x work p95 | 3x sim ms/tick | 3x ticks/frame | rAF p50 | rAF p95 | Live GPU p95 | Heap MB |')
print('| --- ' * 15 + '|')
for k in sorted(groups, key=order):
    if k[3] != 'high' or k[4] != '':
        continue
    rs = groups[k]
    print(f"| {k[0]} | {k[1]} | {k[2]} | {med(rs, lambda r: r['x1']['inView']):.0f} | {f2(med(rs, lambda r: r['x1']['workP50']),1)} | {f2(med(rs, lambda r: r['x1']['workP95']),1)} | {f2(med(rs, lambda r: r['x1']['simMsPerTick']))} | {f2(med(rs, lambda r: r['x3']['workP50']),1)} | {f2(med(rs, lambda r: r['x3']['workP95']),1)} | {f2(med(rs, lambda r: r['x3']['simMsPerTick']))} | {f2(med(rs, lambda r: r['x3']['ticksPerFrame']))} | {f2(med(rs, lambda r: r['pace']['rafP50']),1)} | {f2(med(rs, lambda r: r['pace']['rafP95']),1)} | {f2(med(rs, lambda r: r['x1']['gpuP95']))} | {med(rs, lambda r: r['heapMb'] or 0):.0f} |")

print('\n### GPU, 1440p Medium, frozen\n')
print('| Layout | Aircraft | Ships | GPU p50 | GPU p95 | High p95 |')
print('| --- ' * 6 + '|')
for k in sorted(groups, key=order):
    if k[3] != 'medium' or k[4] != '':
        continue
    rs = groups[k]
    hi = groups.get((k[0], k[1], k[2], 'high', ''))
    print(f"| {k[0]} | {k[1]} | {k[2]} | {f2(med(rs, lambda r: r['frozen']['gpuP50']))} | {f2(med(rs, lambda r: r['frozen']['gpuP95']))} | {f2(med(hi, lambda r: r['frozen']['gpuP95'])) if hi else '-'} |")

print('\n### Ablations, High (frozen GPU; live 1x main-thread work)\n')
print('| Layout | Aircraft | Ships | Variant | GPU p50 | GPU p95 | Draw calls | Work p50 | Work p95 | n |')
print('| --- ' * 10 + '|')
abl = sorted({(k[0], k[1], k[2]) for k in groups if k[4] != '' and k[3] == 'high'}, key=lambda t: (t[0] != 'tight', t[1], t[2]))
for (lay, a, s) in abl:
    for prm in ['', 'swarmHide=1', 'fx=off']:
        rs = groups.get((lay, a, s, 'high', prm))
        if not rs:
            continue
        print(f"| {lay} | {a} | {s} | {prm or 'as shipped'} | {f2(med(rs, lambda r: r['frozen']['gpuP50']))} | {f2(med(rs, lambda r: r['frozen']['gpuP95']))} | {med(rs, lambda r: r['frozen']['drawCalls']):.0f} | {f2(med(rs, lambda r: r['x1']['workP50']),1)} | {f2(med(rs, lambda r: r['x1']['workP95']),1)} | {len(rs)} |")
