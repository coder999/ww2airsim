// src/render/sounds/main.ts
import { AUDIO_ASSETS } from '../../audio/assets.js'
import { playLoopedPreview } from '../../audio/webAudio.js'
import { groupCandidates, type CandidateTake } from './library.js'

/**
 * sounds.html's entry: every sound the game ships, and every candidate take
 * staged for audition, each with a native player (2026-10-09, Mark: "like
 * Hangar but for sound"). Plain DOM: no WebGPU and no game audio graph, so it
 * plays files as recorded, without the in-game mix or radio treatment.
 * Linked from the title screen only while Dev is checked.
 */
const BASE = import.meta.env.BASE_URL
const CANDIDATES = `${BASE}content/audio/candidates/`
const root = document.getElementById('app')!
root.style.cssText = 'max-width:960px;margin:0 auto;padding:24px 16px'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.style.cssText = css
  e.textContent = text
  return e
}

function player(src: string, loop: boolean): HTMLElement {
  if (loop) return looper(src)
  const a = el('audio', 'height:32px;width:280px;flex:none')
  a.controls = true
  a.preload = 'none'
  a.src = src
  return a
}

// <audio loop> restarts with an audible gap (Mark heard it on aa_gun, 2026-10-09).
// The game loops sample-accurately, so loops play that way here too (via
// playLoopedPreview). One loop at a time.
let stopLoop: (() => void) | null = null
function looper(src: string): HTMLButtonElement {
  const b = el('button', 'height:32px;width:280px;flex:none;cursor:pointer', '▶ loop')
  b.onclick = async () => {
    const mine = b.textContent !== '▶ loop'
    stopLoop?.()
    if (mine) return
    const stop = await playLoopedPreview(src)
    b.textContent = '■ stop'
    stopLoop = () => { stop(); b.textContent = '▶ loop'; stopLoop = null }
  }
  return b
}

const TAG = 'font:600 11px system-ui;letter-spacing:.06em;padding:2px 6px;border-radius:3px;flex:none'
const tag = (text: string, color: string): HTMLSpanElement => el('span', `${TAG};background:${color};color:#0b0d10`, text)
const ROW = 'display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #1e242b;flex-wrap:wrap'

root.append(el('h1', 'font-size:22px;margin:0 0 4px', 'Sounds'))
const filter = el('input', 'width:100%;box-sizing:border-box;margin:12px 0 4px;padding:8px;background:#151a20;color:inherit;border:1px solid #2a323b;border-radius:4px')
filter.placeholder = 'Filter by name or line…'
root.append(filter)

// ---- In game: the AUDIO_ASSETS table, the one list of what ships.
root.append(el('h2', 'font-size:16px;margin:24px 0 8px', `In game (${AUDIO_ASSETS.length})`))
for (const a of AUDIO_ASSETS) {
  const row = el('div', ROW)
  row.dataset['search'] = a.id
  // Engine and ambient beds loop in game, so they loop here (whole file, not the code's loop points).
  row.append(tag('IN GAME', '#7fc58b'), player(BASE + a.path, a.bus === 'engine' || a.bus === 'ambient'),
    el('span', 'font-family:monospace', a.id), el('span', 'color:#8a96a3', `${a.bus} · ${(a.bytes / 1e6).toFixed(2)} MB · peak ${a.peakFullScale.toFixed(2)}`))
  root.append(row)
}

// ---- Not in game: candidate takes, fetched at run time because the directory is gitignored.
const candidates = el('div', '')
root.append(candidates)
void (async () => {
  let takes: CandidateTake[]
  try {
    const res = await fetch(`${CANDIDATES}index.json`)
    if (!res.ok) throw new Error(String(res.status))
    takes = await res.json() as CandidateTake[]
  } catch {
    candidates.append(el('p', 'color:#8a96a3;margin-top:24px', 'No candidate takes on this server. They live only in the nexus working copy, in content/audio/candidates/.'))
    return
  }
  const groups = groupCandidates(takes, AUDIO_ASSETS)
  candidates.append(el('h2', 'font-size:16px;margin:24px 0 8px', `Not in game: candidates (${takes.length} takes, ${groups.length} cues)`))
  for (const g of groups) {
    const box = el('div', 'padding:10px 0;border-bottom:1px solid #2a323b')
    // The box matches if any take does; each take row also filters itself, so "jerry" narrows to one voice.
    const searchOf = (t: CandidateTake): string => [g.cue, t.take, t.note, t.text ?? ''].join(' ')
    box.dataset['search'] = g.takes.map(searchOf).join(' ')
    const head = el('div', 'display:flex;gap:8px;align-items:center;margin-bottom:4px')
    head.append(el('span', 'font:600 14px monospace', g.cue))
    if (g.replaces) head.append(tag(`REPLACES IN-GAME ${g.replaces}`, '#e3b75a'))
    box.append(head)
    for (const t of g.takes) {
      const row = el('div', 'display:flex;align-items:center;gap:12px;padding:3px 0;flex-wrap:wrap')
      row.dataset['search'] = searchOf(t)
      row.append(tag('NOT IN GAME', '#e07a6a'), player(CANDIDATES + t.file, t.take.startsWith('loop')),
        el('span', 'font:12px monospace;width:150px', t.clip.endsWith('_ja') ? `JA · ${t.take}` : t.clip.endsWith('_us') ? `US · ${t.take}` : t.take),
        el('span', 'flex:1;min-width:200px', t.text ?? ''),
        el('span', 'color:#8a96a3;font-size:12px;width:100%', t.note))
      box.append(row)
    }
    candidates.append(box)
  }
  applyFilter()
})()

function applyFilter(): void {
  const q = filter.value.trim().toLowerCase()
  for (const e of root.querySelectorAll<HTMLElement>('[data-search]')) {
    e.classList.toggle('filtered', !!q && !e.dataset['search']!.toLowerCase().includes(q))
  }
}
filter.addEventListener('input', applyFilter)
