import { showFailure } from '../failure.js'
import { buildCatalog } from './catalog.js'
import { loadHangarContent } from './contentIndex.js'

const root = document.getElementById('app')!
try {
  const catalog = buildCatalog(loadHangarContent())
  root.textContent = `${catalog.length} library entries`
} catch (e) {
  showFailure(root, 'bad-content', e instanceof Error ? e.message : String(e))
}
