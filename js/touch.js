// Zefiro AR – comandi a schermo per telefono (DOM overlay in AR, anche in anteprima)
// ◀ / ▶ tenuti premuti ruotano la scena; "Fine" passa alla velocità lenta.

export function creaTouch(root, azioni) {
  const q = s => root.querySelector(s);
  let dir = 0, fine = false;

  for (const [sel, d] of [['#tSx', 1], ['#tDx', -1]]) {
    const b = q(sel);
    b.addEventListener('pointerdown', e => { e.preventDefault(); dir = d; b.setPointerCapture(e.pointerId); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { dir = 0; });
  }
  q('#tFine').addEventListener('click', e => { fine = !fine; e.currentTarget.classList.toggle('on', fine); });
  q('#tAllinea').addEventListener('click', () => azioni.allinea());
  q('#tBersaglio').addEventListener('click', () => azioni.successivo());
  q('#tEtichette').addEventListener('click', e => e.currentTarget.classList.toggle('on', azioni.etichette()));
  q('#tFantasmi').addEventListener('click', e => e.currentTarget.classList.toggle('on', azioni.fantasmi()));
  q('#tEsci').addEventListener('click', () => azioni.esci());

  // i tocchi sui pulsanti non devono diventare "select" della sessione XR
  root.addEventListener('beforexrselect', e => e.preventDefault());

  const hud = q('#tHud');
  let ultimo = '';
  return {
    get dir() { return dir; },
    get fine() { return fine; },
    testo(righe) {
      const t = righe.filter(Boolean).join('\n');
      if (t !== ultimo) { hud.textContent = t; ultimo = t; }
    },
    mostra(v) { root.hidden = !v; if (!v) dir = 0; }
  };
}
