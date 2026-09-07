const el = id => document.getElementById(id);
const api = window.practice;
const confirm = el('confirm');
async function act(name, value) {
  try { await api.action(name, value); }
  catch { el('status').textContent = 'That action failed. Please try again.'; }
}
for (const id of ['random', 'browse', 'login', 'reload', 'back']) el(id).addEventListener('click', () => act(id));
el('lock').addEventListener('click', () => confirm.showModal());
el('cancel').addEventListener('click', () => confirm.close());
el('confirm-lock').addEventListener('click', async () => {
  const password = el('focus-password').value;
  if (password !== el('focus-password-confirm').value) { el('password-error').textContent = 'Passwords do not match.'; return; }
  await act('lock', password);
  el('focus-password').value = ''; el('focus-password-confirm').value = ''; el('password-error').textContent = ''; confirm.close();
});
confirm.addEventListener('close', () => { el('focus-password').value = ''; el('focus-password-confirm').value = ''; el('password-error').textContent = ''; });
el('emergency').addEventListener('click', () => act('emergency'));
el('exit-cancel').addEventListener('click', () => act('emergency-cancel'));
el('emergency-dialog').addEventListener('cancel', event => { event.preventDefault(); void act('emergency-cancel'); });
el('emergency-form').addEventListener('submit', async event => {
  event.preventDefault(); const password = el('exit-password').value; el('exit-password').value = ''; await act('emergency-unlock', password);
});
el('shortcut').addEventListener('keydown', async event => {
  if (event.key === 'Tab') return;
  event.preventDefault();
  const key = event.key.toUpperCase();
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key) || !(event.ctrlKey || event.altKey || event.metaKey)) return;
  const parts = [];
  if (event.ctrlKey) parts.push('Control'); if (event.metaKey) parts.push('Command');
  if (event.altKey) parts.push('Alt'); if (event.shiftKey) parts.push('Shift'); parts.push(key);
  try { await api.action('shortcut', parts.join('+')); el('shortcut-help').textContent = 'Shortcut saved.'; }
  catch { el('shortcut-help').textContent = 'That shortcut is unavailable. Try another combination.'; }
});
el('wake').addEventListener('change', e => act('wake', e.target.checked));
el('startup').addEventListener('change', e => act('startup', e.target.checked));
api.onState(state => {
  if (!state) return;
  document.body.classList.toggle('locked', state.locked);
  el('exit-shortcut').textContent = state.emergencyShortcut;
  el('shortcut').value = state.emergencyShortcut;
  el('shortcut').disabled = state.locked;
  el('emergency').hidden = !state.locked;
  const exitDialog = el('emergency-dialog');
  if (state.emergencyRequested && !exitDialog.open) { exitDialog.showModal(); el('exit-password').focus(); }
  if (!state.emergencyRequested && exitDialog.open) { exitDialog.close(); el('exit-password').value = ''; }
  el('exit-error').textContent = state.emergencyError;
  el('badge').textContent = state.locked ? 'ON' : 'OFF';
  el('focus-title').textContent = state.locked ? 'You’ve got this.' : 'Make yourself a deal.';
  el('focus-copy').textContent = state.locked ? 'One new Accepted unlocks the window. Any problem counts.' : 'Stay here until your next Accepted. Switch problems whenever you want.';
  el('lock').textContent = state.locked ? 'Locked in · keep going' : 'Lock in →';
  el('lock').disabled = state.locked || !state.detector.startsWith('Ready');
  el('startup').checked = state.settings.login;
  el('startup').disabled = state.locked || !state.packaged;
  el('startup-note').hidden = state.packaged;
  el('wake').checked = state.settings.wake;
  el('wake').disabled = state.locked;
  el('back').disabled = !state.canBack;
  el('login').hidden = state.signedIn === true;
  for (const id of ['status', 'detector', 'detectorDetail', 'catalog', 'url']) el(id).textContent = state[id];
});
