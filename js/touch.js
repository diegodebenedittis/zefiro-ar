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

  // barra della taratura
  q('#tTarAnnulla').addEventListener('click', () => azioni.taratura('annulla'));
  q('#tTarB').addEventListener('click', () => azioni.taratura('cambiaB'));
  q('#tTarApplica').addEventListener('click', () => azioni.taratura('applica'));

  // i tocchi sui pulsanti non devono diventare "select" della sessione XR
  root.addEventListener('beforexrselect', e => e.preventDefault());

  function mostraMenu(v) { menu = v; q('#tPannello').hidden = !v; q('#tMenu').classList.toggle('on', v); }

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
    mostra(v) { root.hidden = !v; if (!v) { dir = 0; mostraMenu(false); } },
    campo(valore) { q('#tCampo').textContent = valore.toFixed(1) + '°'; }
  };
}
