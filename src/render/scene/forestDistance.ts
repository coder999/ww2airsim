/** Attended experiment; accepted near and distant trees remain the default. */
export function longForestEnabled(): boolean {
  return !!import.meta.env?.DEV && typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('forestDistance') === 'long'
}
