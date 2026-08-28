const THEME_KEY = 'geradorextrato-theme'
type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
  const button = document.getElementById('theme-toggle')
  if (button) {
    button.textContent = theme === 'dark' ? '☀ Claro' : '☾ Escuro'
    button.setAttribute('aria-label', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro')
    button.title = theme === 'dark' ? 'Modo claro' : 'Modo escuro'
  }
}

function installThemeToggle(attempt = 0) {
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) {
    if (attempt < 20) requestAnimationFrame(() => installThemeToggle(attempt + 1))
    return
  }

  let button = document.getElementById('theme-toggle') as HTMLButtonElement | null
  if (!button) {
    button = document.createElement('button')
    button.id = 'theme-toggle'
    button.type = 'button'
    button.className = 'theme-toggle'
    button.addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
    })
    hero.appendChild(button)
  }
  setTheme((document.documentElement.dataset.theme as Theme) || 'light')
}

setTheme(getInitialTheme())
void import('./main_original').then(() => requestAnimationFrame(() => installThemeToggle()))
