// Zefiro AR – avvio, interfaccia, ciclo di rendering (Meta Quest 3 e telefono Android)
import { leggiProgetto, turbinePerPunto, infoPunto, datiDemo } from './dati.js?v=202610251911';
import { creaScena, popolaMondo, seguiTesta } from './scena.js?v=202610251911';
import { creaControlli } from './controlli.js?v=202610251911';
import { creaHud } from './hud.js?v=202610251911';
import { creaTouch } from './touch.js?v=202610251911';
import { creaFotocamera } from './fotocamera.js?v=202610251911';
import { creaGps } from './gps.js?v=202610251911';
import { decodificaTerreno, puntoLibero } from './terreno.js?v=202610251911';
import { deg, VERSIONE } from './geo.js?v=202610251911';

const $ = id => document.getElementById(id);
const { renderer, scene, camera, mondo } = creaScena(document.body);
renderer.domElement.style.display = 'none';

const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const MOBILE = !QUEST && (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

let prog = null, mondoAttivo = null, inizializzato = false, etichetteOn = true, fantasmiOn = false;
let modoTouch = false;                       // HUD e comandi a schermo (telefono)
let tracciato = false, diag = '';
let avviso = null;                           // messaggio temporaneo nella fascia gialla            // stato del tracciamento e riga diagnostica
const stato = { theta: 0, iB: 0, sensori: false };   // sensori: modalità fotocamera
const hud = creaHud(camera);

const azioni = {
  allinea() {
    const b = mondoAttivo?.bersagli[stato.iB]; if (!b) return;
    ctrl.allineaAz(b.az);
  },
  successivo() {
    if (!mondoAttivo?.bersagli.length) return;
    stato.iB = (stato.iB + 1) % mondoAttivo.bersagli.length;
  },
  etichette() {
    etichetteOn = !etichetteOn;
    mondoAttivo?.etichette.forEach(e => e.visible = etichetteOn);
    hud.visibile = etichetteOn && !modoTouch;
    return etichetteOn;
  },
  fantasmi() {
    fantasmiOn = !fantasmiOn;
    mondoAttivo?.fantasmi.forEach(f => f.visible = fantasmiOn);
    return fantasmiOn;
  },
  esci() {
    const s = renderer.xr.getSession();
    if (s) s.end(); else { cam.ferma(); location.reload(); }
  },
  campo(d) {
    cam.regolaFov(d);
    touch.campo(cam.fov);
    avviso = { testo: `Campo visivo ${cam.fov.toFixed(0)}° (verticale schermo ${camera.fov.toFixed(1)}°)`, fino: performance.now() + 1500 };
  }
};
const cam = creaFotocamera($('video'), camera);
const gps = creaGps(() => aggiornaInfo());
let terreno = null;                          // terreno compatto decodificato (punti liberi)
const touch = creaTouch($('touch'), azioni);
const ctrl = creaControlli(renderer, camera, stato, azioni, touch);

function impostaModoTouch(v) {
  modoTouch = v;
  touch.mostra(v);
  hud.visibile = etichetteOn && !v;
}

// ---------- dati
$('file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    prog = leggiProgetto(JSON.parse(await f.text()));
    terreno = null;
    if (prog.terrenoGrezzo) {
      try { terreno = await decodificaTerreno(prog.terrenoGrezzo); }
      catch (err) { prog.avvisi.push('terreno non leggibile: ' + err.message); }
    }
    const sel = $('punto'); sel.innerHTML = '';
    sel.add(new Option('📍 Posizione attuale (GPS del telefono)', 'gps'));
    prog.punti.forEach((p, i) => sel.add(new Option(`${p.id} – ${p.etichetta ?? ''}`, i)));
    sel.value = prog.punti.length ? '0' : 'gps';
    sel.disabled = false; $('usaDemo').checked = false;
    aggiornaInfo();
  } catch (err) { $('infoDati').textContent = 'Errore: ' + err.message; }
});
$('punto').addEventListener('change', aggiornaInfo);
function aggiornaInfo() {
  if (!prog) return;
  if ($('punto').value === 'gps') {
    gps.avvia();
    const f = gps.fix;
    const ter = terreno ? '' : ' · export senza terreno: niente skyline né parti nascoste';
    $('infoDati').textContent = gps.errore ? 'GPS: ' + gps.errore
      : f ? `GPS ±${Math.round(f.acc)} m · ${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}${ter}`
          : 'In attesa del GPS… (all\'aperto, qualche secondo)' + ter;
    return;
  }
  gps.ferma();
  const p = prog.punti[$('punto').value];
  $('infoDati').textContent = `${prog.nome}: ${infoPunto(prog, p)}` +
    (prog.avvisi.length ? ' · ' + prog.avvisi.join('; ') : '');
}

function selezione() {
  if ($('usaDemo').checked || !prog) {
    const v = k => +$(k).value;
    return datiDemo({ dist: v('dDist'), az: v('dAz'), h: v('dH'), hub: v('dHub'), D: v('dD'), dz: v('dDz') });
  }
  if ($('punto').value === 'gps') {
    if (!gps.fix) throw new Error('posizione GPS non ancora disponibile');
    const p = puntoLibero(prog, terreno, gps.fix);
    gps.ferma();
    return { punto: p, turbine: turbinePerPunto(prog, p) };
  }
  const p = prog.punti[$('punto').value];
  return { punto: p, turbine: turbinePerPunto(prog, p) };
}

// ---------- verifica supporto
const supportato = navigator.xr ? await navigator.xr.isSessionSupported('immersive-ar').catch(() => false) : false;
$('entra').disabled = false;
if (supportato) {
  $('entra').textContent = 'Entra in AR';
  $('stato').textContent = QUEST
    ? 'Entra guardando verso il parco: la scena parte centrata sul baricentro, poi allinea.'
    : 'Tieni il telefono davanti a te, rivolto verso il parco, poi entra e allinea con i pulsanti.';
} else {
  $('entra').textContent = 'Anteprima (AR non disponibile)';
  $('stato').textContent = MOBILE
    ? 'Per la realtà aumentata servono Chrome per Android e "Google Play Services for AR". Intanto: anteprima, trascina col dito per guardarti intorno.'
    : 'Anteprima: trascina per guardarti intorno · ←/→ ruota (Shift = fine) · Invio allinea · Spazio bersaglio · h etichette · g fantasmi';
}
$('guidaQuest').hidden = MOBILE;
// telefono: la modalità fotocamera è quella principale (funziona anche dove l'AR di Chrome no)
$('entraCam').hidden = !MOBILE;
if (MOBILE) {
  $('entra').classList.add('secondario');
  if (supportato) $('entra').textContent = 'Entra in AR (WebXR, sperimentale)';
  $('stato').textContent = 'Modalità fotocamera: tieni il telefono verticale all\'altezza degli occhi, rivolto verso il parco, poi allinea con i pulsanti.';
}
$('versione').textContent = 'versione ' + VERSIONE;
$('guidaTelefono').hidden = !MOBILE;

// ---------- avvio sessione
async function avviaAR() {
  // Chrome per Android non mostra il livello 3D se il canvas è nascosto: va reso visibile
  renderer.domElement.style.display = 'block';
  if (!QUEST) impostaModoTouch(true);        // la radice del DOM overlay deve essere visibile
  const sess = await navigator.xr.requestSession('immersive-ar', {
    optionalFeatures: ['local-floor', 'dom-overlay'],
    domOverlay: { root: $('touch') }
  });
  // local-floor (Quest) se disponibile, altrimenti local (molti telefoni): occhio all'origine
  let tipo = 'local-floor';
  try { await sess.requestReferenceSpace('local-floor'); } catch { tipo = 'local'; }
  renderer.xr.setReferenceSpaceType(tipo);
  await renderer.xr.setSession(sess);
  renderer.xr.getReferenceSpace()?.addEventListener('reset', () => inizializzato = false);
  const overlay = !!sess.domOverlayState;
  impostaModoTouch(overlay);
  if (!overlay && !QUEST) {                  // telefono senza overlay: HUD 3D più lontano, tocco = Allinea
    hud.posizione(0, -0.25, -2.4);
    sess.addEventListener('select', () => azioni.allinea());
  }
  const n = mondoAttivo.bersagli.filter(b => b.tipo === 't').length;
  diag = `rif. ${tipo} · overlay ${overlay ? 'sì' : 'no'} · ${n} turbine`;
  sess.addEventListener('end', () => {
    impostaModoTouch(false);
    renderer.domElement.style.display = 'none';
    $('pannello').style.display = '';
  });
}

function preparaScena() {
  const { punto, turbine } = selezione();
  mondoAttivo = popolaMondo(mondo, punto, turbine);
  mondoAttivo.punto = punto; mondoAttivo.azIniziale = punto.baricentro?.az ?? turbine[0]?.az ?? 0;
  stato.iB = 0; inizializzato = false; tracciato = false; fantasmiOn = false; etichetteOn = true;
  $('tEtichette').classList.add('on'); $('tFantasmi').classList.remove('on');
}

$('entraCam').addEventListener('click', async () => {
  try {
    preparaScena();
    await cam.avvia();
    stato.sensori = true;
    touch.campo(cam.fov);
    document.body.classList.add('modo-cam');
    renderer.domElement.style.display = 'block';
    impostaModoTouch(true);
    $('pannello').style.display = 'none';
  } catch (err) {
    $('stato').textContent = 'Impossibile avviare la fotocamera: ' + err.message;
  }
});

$('entra').addEventListener('click', async () => {
  try {
    preparaScena();
    if (supportato) {
      await avviaAR();
    } else {
      tracciato = true; diag = 'anteprima senza AR';
      renderer.domElement.style.display = 'block';
      impostaModoTouch(MOBILE);
      addEventListener('keydown', e => { if (e.key === 'Escape') location.reload(); });
    }
    $('pannello').style.display = 'none';
  } catch (err) {
    $('stato').textContent = 'Impossibile avviare: ' + err.message;
  }
});

// ---------- ciclo
function guida(b) {
  if (avviso && performance.now() < avviso.fino) return avviso.testo;
  if (stato.sensori && !tracciato) return 'In attesa dei sensori di orientamento… muovi il telefono';
  if (stato.sensori && cam.fermo) return 'Sensori di orientamento fermi: il browser non li fornisce';
  if (!tracciato) return 'Muovi lentamente il telefono per avviare il tracciamento…';
  if (!b) return '';
  const d = ctrl.scarto(b.az);                       // >0: il bersaglio è a sinistra
  if (Math.abs(d) < 15) return 'Allinea il bersaglio reale al mirino e premi Allinea';
  return d > 0 ? `◀  gira a sinistra di ${d.toFixed(0)}°` : `gira a destra di ${(-d).toFixed(0)}°  ▶`;
}

let tPrec = 0, tAttesa = 0;
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(0.1, (t - tPrec) / 1000 || 0); tPrec = t;
  if (frame && !tracciato) {
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    tAttesa = pose ? tAttesa + dt : 0;
    // posa a 6 gradi di libertà, oppure posa (anche solo orientamento) stabile da 3 s
    tracciato = !!pose && (!pose.emulatedPosition || tAttesa > 3);
  }
  if (stato.sensori) {
    cam.aggiorna();
    tracciato = cam.pronto;
    diag = `fotocamera · campo ${cam.fov}°`;
  }
  if (mondoAttivo) {
    // allineamento iniziale al baricentro solo con una posa valida
    if (!inizializzato && tracciato) { ctrl.allineaAz(mondoAttivo.azIniziale); inizializzato = true; }
    ctrl.aggiorna(dt);
    mondo.rotation.y = stato.theta;
    seguiTesta(mondo, camera, mondoAttivo.piani);
    for (const r of mondoAttivo.rotori) r.rotation.z -= dt * 2 * Math.PI * 10 / 60;   // 10 giri/min
    const b = mondoAttivo.bersagli[stato.iB];
    const righe = [
      guida(b),
      `${mondoAttivo.punto.id}  ·  vista ${ctrl.azTesta().toFixed(1)}°N  ·  rot. ${deg(stato.theta).toFixed(1)}°`,
      b ? `Bersaglio: ${b.nome} (${b.az.toFixed(1)}°)  Δ ${ctrl.scarto(b.az).toFixed(2)}°` : 'nessun bersaglio',
      fantasmiOn ? 'parti nascoste: visibili' : '',
      `${diag} · disegnati ${renderer.info.render.calls} · v${VERSIONE.slice(-4)}`
    ];
    if (modoTouch) touch.testo(righe); else hud.imposta(righe);
  }
  renderer.render(scene, camera);
});
