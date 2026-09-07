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
el('confirm-lock').addEventListener('click', () => { confirm.close(); void act('lock'); });
el('wake').addEventListener('change', e => act('wake', e.target.checked));
el('startup').addEventListener('change', e => act('startup', e.target.checked));
api.onState(state => {
  if (!state) return;
  document.body.classList.toggle('locked', state.locked);
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
  for (const id of ['status', 'detector', 'catalog', 'url']) el(id).textContent = state[id];
});
