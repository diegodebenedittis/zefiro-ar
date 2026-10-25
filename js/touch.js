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
  q('#tCampoMeno').addEventListener('click', () => azioni.campo(-0.5));
  q('#tCampoPiu').addEventListener('click', () => azioni.campo(0.5));

  // i tocchi sui pulsanti non devono diventare "select" della sessione XR
  root.addEventListener('beforexrselect', e => e.preventDefault());

  const hud = q('#tHud'), gd = q('#tGuida');
  let ultimo = '';
  return {
    get dir() { return dir; },
    get fine() { return fine; },
    testo([guida, ...righe]) {
      const t = (guida || '') + '\u0000' + righe.filter(Boolean).join('\n');
      if (t === ultimo) return;
      ultimo = t;
      gd.textContent = guida || ''; gd.hidden = !guida;
      hud.textContent = righe.filter(Boolean).join('\n');
    },
    mostra(v) { root.hidden = !v; if (!v) dir = 0; }
  };
}
