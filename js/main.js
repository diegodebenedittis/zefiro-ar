// Zefiro AR – avvio, interfaccia, ciclo di rendering (Meta Quest 3 e telefono Android)
import { leggiProgetto, turbinePerPunto, infoPunto, datiDemo } from './dati.js?v=202610261356';
import { creaScena, popolaMondo, seguiTesta } from './scena.js?v=202610261356';
import { creaControlli } from './controlli.js?v=202610261356';
import { creaHud } from './hud.js?v=202610261356';
import { creaTouch } from './touch.js?v=202610261356';
import { creaFotocamera } from './fotocamera.js?v=202610261356';
import { creaGps } from './gps.js?v=202610261356';
import { decodificaTerreno, puntoLibero } from './terreno.js?v=202610261356';
import { creaTaratura } from './taratura.js?v=202610261356';
import { deg, VERSIONE } from './geo.js?v=202610261356';

const $ = id => document.getElementById(id);
const { renderer, scene, camera, mondo } = creaScena(document.body);
renderer.domElement.style.display = 'none';

const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const MOBILE = !QUEST && (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

let prog = null, mondoAttivo = null, inizializzato = false, etichetteOn = true, fantasmiOn = false;
let modoTouch = false;                       // HUD e comandi a schermo (telefono)
let tracciato = false, diag = '';            // stato del tracciamento e riga diagnostica
let avviso = null;                           // messaggio temporaneo nella fascia gialla
const stato = { theta: 0, iB: 0, sensori: false };   // sensori: modalità fotocamera
const hud = creaHud(camera);

const azioni = {
  allinea() {
    const b = mondoAttivo?.bersagli[stato.iB]; if (!b) return;
    ctrl.allineaAz(b.az);
  },
  successivo() {
    const n = mondoAttivo?.bersagli.length ?? 0;
    if (!n) return;
    stato.iB = (stato.iB + 1) % n;
    const b = mondoAttivo.bersagli[stato.iB];
    avviso = { testo: n > 1 ? `▼ ${stato.iB + 1}/${n}: ${b.nome}`
                            : `Un solo bersaglio: ${b.nome}`, fino: performance.now() + 2000 };
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
  taratura(cmd) {
    if (cmd === 'avvia') tar.avvia(stato.iB);
    else if (cmd === 'annulla') tar.annulla();
    else if (cmd === 'cambiaB') tar.cambiaB();
    else if (cmd === 'applica') tar.applica();
    document.body.classList.toggle('taratura', tar.attiva);
  },
  alzo(d) {
    if (d === null) cam.azzeraAlzo(); else cam.regolaAlzo(d);
    avviso = { testo: `▲▼ ${cam.alzo >= 0 ? '+' : ''}${cam.alzo.toFixed(2)}°`, fino: performance.now() + 1200 };
  },
  scatto(gradi) { stato.theta += gradi * Math.PI / 180; },
  bussola() {
    const h = cam.bussola;
    if (h == null) { avviso = { testo: 'Bussola non disponibile su questo telefono/browser', fino: performance.now() + 2500 }; return; }
    const az = (h + declinazione() + 360) % 360;
    ctrl.allineaAz(az);
    avviso = { testo: `Bussola ${az.toFixed(0)}°N (±5–10°): rifinisci con Allinea`, fino: performance.now() + 3000 };
  },
  campo(d) {
    cam.regolaFov(d);
    touch.campo(cam.fov);
    avviso = { testo: `Campo ${cam.fov.toFixed(1)}°`, fino: performance.now() + 1500 };
  }
};
const cam = creaFotocamera($('video'), camera);
const gps = creaGps(() => aggiornaInfo());
let terreno = null;
const tar = creaTaratura($('tTar'), cam, {
  bersagli: () => mondoAttivo?.bersagli ?? [],
  messaggio: t => { avviso = { testo: t, fino: performance.now() + 2500 }; },
  applica: r => {
    stato.theta = r.theta;
    cam.impostaFovVerticale(r.fovV);
    cam.regolaAlzo(r.dEl);                        // corregge anche l'inclinazione del sensore
    touch.campo(cam.fov);
    avviso = { testo: `Tarato: campo ${cam.fov.toFixed(1)}° · ▲▼ ${cam.alzo.toFixed(2)}°`, fino: performance.now() + 3500 };
  }
});
// taratura: i tocchi sull'immagine congelata segnano i bersagli reali
renderer.domElement.addEventListener('pointerdown', e => { if (tar.attiva) tar.tocco(e.clientX, e.clientY); });                          // terreno compatto decodificato (punti liberi)
const touch = creaTouch($('touch'), azioni);
const ctrl = creaControlli(renderer, camera, stato, azioni, touch);

function impostaModoTouch(v) {
  modoTouch = v;
  touch.mostra(v);
  hud.visibile = etichetteOn && !v;
  hud.mirino = !v;                           // telefono: mirino CSS a dimensione fissa
}
// declinazione magnetica (°E) dall'export, per passare dalla bussola al Nord vero
const declinazione = () => +(prog?.declinazione ?? 0) || 0;

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
  stato.iB = 0; inizializzato = false; tracciato = false; tBussola = 0; fantasmiOn = false; etichetteOn = true;
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
  if (tar.attiva) return tar.guida();
  if (avviso && performance.now() < avviso.fino) return avviso.testo;
  if (stato.sensori && !tracciato) return 'Muovi il telefono…';
  if (stato.sensori && cam.fermo) return 'Sensori di orientamento non disponibili';
  if (!tracciato) return 'Muovi lentamente il telefono…';
  if (!b) return '';
  const d = ctrl.scarto(b.az);                       // >0: il bersaglio è a sinistra
  if (Math.abs(d) < 15) return '';                   // a portata: nessun messaggio, centro libero
  return d > 0 ? `◀ ${d.toFixed(0)}°` : `${(-d).toFixed(0)}° ▶`;
}

let tPrec = 0, tAttesa = 0, tBussola = 0;
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
    if (!inizializzato && tracciato) {
      // telefono: bussola se risponde entro ~1,5 s, altrimenti baricentro davanti a sé
      tBussola += dt;
      if (stato.sensori && cam.bussola != null) { azioni.bussola(); inizializzato = true; }
      else if (!stato.sensori || tBussola > 1.5) {
        ctrl.allineaAz(mondoAttivo.azIniziale); inizializzato = true;
        if (stato.sensori) avviso = { testo: 'Bussola assente: parco davanti a te, allinea a mano', fino: performance.now() + 3000 };
      }
    }
    ctrl.aggiorna(dt);
    mondo.rotation.y = stato.theta;
    seguiTesta(mondo, camera, mondoAttivo.piani);
    for (const r of mondoAttivo.rotori) r.rotation.z -= dt * 2 * Math.PI * 10 / 60;   // 10 giri/min
    const b = mondoAttivo.bersagli[stato.iB];
    mondoAttivo.segna(b);
    const righe = [
      guida(b),
      `${mondoAttivo.punto.id}  ·  vista ${ctrl.azTesta().toFixed(1)}°N  ·  rot. ${deg(stato.theta).toFixed(1)}°`,
      b ? `Bersaglio: ${b.nome} (${b.az.toFixed(1)}°)  Δ ${ctrl.scarto(b.az).toFixed(2)}°` : 'nessun bersaglio',
      fantasmiOn ? 'parti nascoste: visibili' : '',
      `${diag} · disegnati ${renderer.info.render.calls} · v${VERSIONE.slice(-4)}`
    ];
    if (modoTouch) {
      touch.orienta(camera.quaternion);
      const sc = b ? ctrl.scarto(b.az) : 0;
      touch.testo(
        `${mondoAttivo.punto.id} · ${ctrl.azTesta().toFixed(1)}°N` + (b ? ` · ▼ ${b.nome} Δ ${sc.toFixed(2)}°` : '') +
          (stato.sensori && cam.alzo ? ` · ▲▼ ${cam.alzo > 0 ? '+' : ''}${cam.alzo.toFixed(2)}°` : ''),
        righe[0],
        [righe[1], righe[2], righe[4]].join('\n'),
        tar.attiva ? tar.esito() : '');
    } else hud.imposta(righe);
  }
  renderer.render(scene, camera);
});
