// Zefiro AR – comandi a schermo per telefono (modalità fotocamera e WebXR con DOM overlay).
// Barra principale: ◀ · Allinea · ▶ · ☰ ; il resto nel pannello ☰.
// ◀ ▶: tocco breve = scatto di 0,1°; tenuti premuti = rotazione che accelera.

const SCATTO = 0.1;              // gradi per tocco breve
const T_TOCCO = 250;             // ms: sotto è un tocco, sopra una pressione

export function creaTouch(root, azioni) {
  const q = s => root.querySelector(s);
  let dir = 0, t0 = 0, menu = false;

  for (const [sel, d] of [['#tSx', 1], ['#tDx', -1]]) {
    const b = q(sel);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      t0 = performance.now(); dir = d;
    });
    const rilascia = () => {
      if (!dir) return;
      if (performance.now() - t0 < T_TOCCO) azioni.scatto(dir * SCATTO);
      dir = 0;
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, rilascia);
  }
  q('#tAllinea').addEventListener('click', () => azioni.allinea());
  q('#tMenu').addEventListener('click', () => mostraMenu(!menu));

  // pannello ☰: le azioni "una tantum" chiudono il pannello, Campo −/+ e Bersaglio no
  const chiudi = f => () => { f(); mostraMenu(false); };
  q('#tBersaglio').addEventListener('click', () => azioni.successivo());
  q('#tBussola').addEventListener('click', chiudi(() => azioni.bussola()));
  q('#tDuePunti').addEventListener('click', chiudi(() => azioni.taratura('avvia')));
  q('#tEtichette').addEventListener('click', e => e.currentTarget.classList.toggle('on', azioni.etichette()));
  q('#tFantasmi').addEventListener('click', e => e.currentTarget.classList.toggle('on', azioni.fantasmi()));
  q('#tEsci').addEventListener('click', () => azioni.esci());
  for (const [sel, d] of [['#tCampoMeno', -1], ['#tCampoPiu', 1]]) {
    const b = q(sel);
    let timer = null;
    const stop = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      let n = 0;
      const passo = () => { azioni.campo(d * (n > 8 ? 2 : 1)); n++; timer = setTimeout(passo, n < 3 ? 350 : 120); };
      passo();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stop);
  }

  // ▲ ▼: 0,05° per tocco; tenendo premuto ripete e accelera
  for (const [sel, d] of [['#tSu', 1], ['#tGiu', -1]]) {
    const b = q(sel);
    let timer = null;
    const stop = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      let n = 0;
      const passo = () => { azioni.alzo(d * (n > 10 ? 0.2 : 0.05)); n++; timer = setTimeout(passo, n < 2 ? 400 : 100); };
      passo();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stop);
  }
  q('#tAzzeraAlzo').addEventListener('click', () => azioni.alzo(null));

  // barra della taratura
  q('#tTarAnnulla').addEventListener('click', () => azioni.taratura('annulla'));
  q('#tTarB').addEventListener('click', () => azioni.taratura('cambiaB'));
  q('#tTarApplica').addEventListener('click', () => azioni.taratura('applica'));

  // i tocchi sui pulsanti non devono diventare "select" della sessione XR
  root.addEventListener('beforexrselect', e => e.preventDefault());

  function mostraMenu(v) {
    menu = v; q('#tPannello').hidden = !v; q('#tMenu').classList.toggle('on', v);
    document.body.classList.toggle('menu-aperto', v);
  }

  // rotazione dei comandi secondo la gravità (telefono ruotato con la rotazione schermo bloccata)
  const ui = q('#tUI');
  let angoloUI = 0;
  function orienta(qc) {
    // direzione "giù" del mondo nelle coordinate della fotocamera: v = q* · (0,-1,0) · q
    const { x, y, z, w } = qc;
    const vx = -(2 * (x * y + w * z)), vy = -(1 - 2 * (x * x + z * z));    // colonna y della matrice di q, trasposta
    if (Math.hypot(vx, vy) < 0.5) return;                                 // telefono quasi orizzontale: non cambiare
    const a = Math.atan2(-vx, -vy) * 180 / Math.PI;                        // gradi, rotazione CSS (oraria)
    const scatto = Math.round(a / 90) * 90;
    const diff = Math.abs(((a - angoloUI + 540) % 360) - 180);
    if (scatto % 360 === angoloUI % 360 || diff < 55) return;              // isteresi
    angoloUI = ((scatto % 360) + 360) % 360;
    ui.classList.toggle('laterale', angoloUI === 90 || angoloUI === 270);
    ui.style.transform = `translate(-50%, -50%) rotate(${angoloUI}deg)`;
  }

  const stato = q('#tStato'), msg = q('#tMsg'), diag = q('#tDiag'), esito = q('#tEsito');
  let ultimo = '';
  return {
    get dir() { return dir; },
    // °/s: parte lenta e accelera tenendo premuto
    get velocita() {
      const t = (performance.now() - t0) / 1000;
      return t < 0.25 ? 0 : t < 1.5 ? 0.4 : t < 3 ? 2 : 6;
    },
    testo(riga, messaggio, diagnostica, risultato) {
      const k = riga + '\u0000' + messaggio + '\u0000' + diagnostica + '\u0000' + risultato;
      if (k === ultimo) return;
      ultimo = k;
      stato.textContent = riga;
      msg.textContent = messaggio || ''; msg.hidden = !messaggio;
      diag.textContent = diagnostica || '';
      esito.textContent = risultato || ''; esito.hidden = !risultato;
    },
    orienta,
    mostra(v) { root.hidden = !v; if (!v) { dir = 0; mostraMenu(false); } },
    campo(valore) { q('#tCampo').textContent = valore.toFixed(1) + '°'; }
  };
}
