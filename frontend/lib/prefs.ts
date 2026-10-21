// Accessibility preferences for this device (plan: Settings). Stored in localStorage, applied to <html>
// before first paint by the inline script in app/layout.tsx. Storage can be unavailable (private mode),
// so every read and write is wrapped and the app works without it.

export type Prefs = {
  theme: 'system' | 'light' | 'dark'
  contrast: 'standard' | 'high'
  patterns: 'off' | 'on'
  text: 'standard' | 'large' | 'larger'
  font: 'standard' | 'readable'
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', contrast: 'standard', patterns: 'off', text: 'standard', font: 'standard' }
const KEY = 'crown.prefs.v1'

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export function applyPrefs(p: Prefs): void {
  const el = document.documentElement
  if (p.theme === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', p.theme)
  el.setAttribute('data-contrast', p.contrast)
  el.setAttribute('data-patterns', p.patterns)
  el.setAttribute('data-text', p.text)
  el.setAttribute('data-font', p.font)
}

export function savePrefs(p: Prefs): void {
  applyPrefs(p)
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage blocked: preferences last for this visit only */
  }
}

// Runs inline in <head> so the page never flashes the wrong theme or text size.
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${KEY}')||'{}');var e=document.documentElement;if(p.theme&&p.theme!=='system')e.setAttribute('data-theme',p.theme);e.setAttribute('data-contrast',p.contrast||'standard');e.setAttribute('data-patterns',p.patterns||'off');e.setAttribute('data-text',p.text||'standard');e.setAttribute('data-font',p.font||'standard');}catch(_){}})();`
