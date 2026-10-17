/**
 * The stop card's data and its screen fade (F5C D2, D7). The card itself is `debrief.ts`'s `LegCard`; this builds it
 * from a world that has just come to rest, so the Node suite pins the choices and the shell only draws them.
 */
import { checkGroundStop } from '../sim/groundStop.js'
import { playerAircraft, type World } from '../sim/loop.js'
import { eligibleLoadouts } from '../sim/sortie.js'
import { racksLabel, type Loadout } from '../sim/weapons/stores.js'
import { friendlyBaseAt } from '../sim/friendly.js'
import type { LandingAt } from '../sim/landing.js'
import type { LegCard } from './debrief.js'
import { DEFAULT_LOADOUT, LOADOUT_OPTIONS } from './titleScreen.js'

/**
 * The card for a flight that has stopped at `at`, or `null` when it is not a friendly base (the sortie then ends as it
 * did before F5C). `flown` is the loadout the leg carried; it stays preselected if the aircraft still allows it.
 * A stop the aircraft cannot relaunch from (a flying boat among ships) is a card with `blocked` set: End Sortie only.
 */
export function buildLegCard(world: World<undefined>, at: LandingAt | null, flown: Loadout, dev: boolean): LegCard | null {
  const player = playerAircraft(world)
  const base = friendlyBaseAt(world, at, player.state.position)
  if (base === null) return null
  const check = checkGroundStop(world)
  const allowed = eligibleLoadouts(player.spec, dev)
  const racks = racksLabel(player.spec)
  const loadouts = LOADOUT_OPTIONS.filter((o) => allowed.includes(o.value)).map((o) => ({ value: o.value, label: o.value === 'bombs' ? racks : o.label }))
  const loadout = allowed.includes(flown) ? flown : allowed.includes(DEFAULT_LOADOUT) ? DEFAULT_LOADOUT : 'clean'
  return check.ok
    ? { base: base.name, placement: check.placement.description, blocked: null, loadouts, loadout }
    : { base: base.name, placement: null, blocked: check.reason, loadouts: [], loadout }
}

export const FADE_OUT_MS = 250
export const FADE_HOLD_MS = 120
export const FADE_IN_MS = 400

/**
 * The short black fade that covers the reposition (D7: "taxiing is not modeled: the aircraft is repositioned, with a
 * short fade"). `run(apply)` fades out, calls `apply` while the screen is black, then fades back in. Wall-clock only;
 * the simulation is paused through it, so nothing about the flight depends on it.
 */
export function createStopFade(root: HTMLElement): { run(apply: () => void): void } {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:11'
  root.appendChild(el)
  return {
    run(apply): void {
      el.style.transition = `opacity ${FADE_OUT_MS}ms ease-in`
      el.style.opacity = '1'
      window.setTimeout(() => {
        apply()
        window.setTimeout(() => {
          el.style.transition = `opacity ${FADE_IN_MS}ms ease-out`
          el.style.opacity = '0'
        }, FADE_HOLD_MS)
      }, FADE_OUT_MS)
    },
  }
}
