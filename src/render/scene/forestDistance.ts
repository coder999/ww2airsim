/** Accepted extended forest; DEV retains the shorter-range comparison. */
export function longForestEnabled(): boolean {
  return !(import.meta.env?.DEV && typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('forestDistance') === 'off')
}
