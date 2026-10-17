import { describe, it } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import { isDestroyed } from '../../../../src/sim/mission/step.js'
import { fieldState } from '../../../../src/sim/mission/fields.js'
import { hold, levelAt, terrainOrSkip } from '../fly.js'

const terrain = terrainOrSkip()
describe.skipIf(terrain === null)('scratch A6 passive', () => {
  it('timeline', () => {
    let w = worldFromScenario(loadScenarioBundle('a6-battle-for-the-airfields', windowsForChapter('A6')), terrain)
    const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
    const T = Number(process.env.SCRATCH_S ?? 700)
    for (let s = 0; s <= T; s += 20) {
      while (w.tick < s * 60) w = hold(w, FAR, 1)
      const m = w.mission!
      const att = w.aircraft.filter((a) => (m.refs['attackers'] ?? []).includes(a.id))
      const alive = (ids: string[]) => w.aircraft.filter((a) => ids.includes(a.id) && !isDestroyed(w as never, a.id)).length
      const dead = (pre: string) => w.aircraft.filter((a) => a.id.startsWith(pre)).filter((a) => isDestroyed(w as never, a.id)).length
      const rel = att.filter((a) => (w.combat.aircraft[a.id]?.bombsDropped ?? 0) > 0).length
      const near = (pre: string) => { const l = w.aircraft.filter((a) => a.id.startsWith(pre) && !isDestroyed(w as never, a.id))[0]; return l ? `${Math.round(l.state.position.x)},${Math.round(l.state.position.y)},${Math.round(l.state.position.z)}` : '-' }
      const fs = ['buri', 'bayug', 'san-pablo'].map((f) => (fieldState(m, w as never, f).serviceable ? 'S' : 'x')).join('')
      const prog = m.objectives.map((o, i) => `${o.id}:${m.progress[i]!.status[0]}${m.progress[i]!.count}`).join(' ')
      console.log(`t=${s} aircraft=${w.aircraft.length} dead k43=${dead('ki43')} z=${dead('a6m2')} k21=${dead('ki21')} g4m=${dead('g4m')} k57=${dead('ki57')} p38=${dead('p38')} released=${rel} fields=${fs} | lead k43 ${near('ki43')} k21 ${near('ki21')} g4m ${near('g4m')} k57 ${near('ki57')} | ${prog}`)
      void alive
    }
  }, 600000)
})
