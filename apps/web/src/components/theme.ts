export function bindTheme(button: HTMLButtonElement) {
  let saved: string | null = null;
  try { saved = localStorage.getItem('theme'); } catch { /* Storage can be disabled. */ }
  document.documentElement.dataset.theme = saved === 'dark' || saved === 'light' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* Theme still works for this session. */ }
  });
}
