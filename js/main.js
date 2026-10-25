// Zefiro AR – avvio, interfaccia, ciclo di rendering (Meta Quest 3 e telefono Android)
import { leggiProgetto, turbinePerPunto, infoPunto, datiDemo } from './dati.js';
import { creaScena, popolaMondo } from './scena.js';
import { creaControlli } from './controlli.js';
import { creaHud } from './hud.js';
import { creaTouch } from './touch.js';
import { deg, H_OCCHIO } from './geo.js';

const $ = id => document.getElementById(id);
const { renderer, scene, camera, mondo } = creaScena(document.body);
renderer.domElement.style.display = 'none';

const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const MOBILE = !QUEST && (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

let prog = null, mondoAttivo = null, inizializzato = false, etichetteOn = true, fantasmiOn = false;
let modoTouch = false;                       // HUD e comandi a schermo (telefono)
const stato = { theta: 0, iB: 0 };
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
    if (s) s.end(); else location.reload();
  }
};
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
    const sel = $('punto'); sel.innerHTML = '';
    prog.punti.forEach((p, i) => sel.add(new Option(`${p.id} – ${p.etichetta ?? ''}`, i)));
    sel.disabled = false; $('usaDemo').checked = false;
    aggiornaInfo();
  } catch (err) { $('infoDati').textContent = 'Errore: ' + err.message; }
});
$('punto').addEventListener('change', aggiornaInfo);
function aggiornaInfo() {
  if (!prog) return;
  const p = prog.punti[$('punto').value];
  $('infoDati').textContent = `${prog.nome}: ${infoPunto(prog, p)}` +
    (prog.avvisi.length ? ' · ' + prog.avvisi.join('; ') : '');
}

function selezione() {
  if ($('usaDemo').checked || !prog) {
    const v = k => +$(k).value;
    return datiDemo({ dist: v('dDist'), az: v('dAz'), h: v('dH'), hub: v('dHub'), D: v('dD'), dz: v('dDz') });
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
$('guidaTelefono').hidden = !MOBILE;

// ---------- avvio sessione
async function avviaAR() {
  const sess = await navigator.xr.requestSession('immersive-ar', {
    optionalFeatures: ['local-floor', 'dom-overlay'],
    domOverlay: { root: $('touch') }
  });
  // local-floor (Quest) se disponibile, altrimenti local (molti telefoni): occhio all'origine
  let tipo = 'local-floor';
  try { await sess.requestReferenceSpace('local-floor'); } catch { tipo = 'local'; }
  renderer.xr.setReferenceSpaceType(tipo);
  mondo.position.y = tipo === 'local' ? -H_OCCHIO : 0;
  await renderer.xr.setSession(sess);
  renderer.xr.getReferenceSpace()?.addEventListener('reset', () => inizializzato = false);
  impostaModoTouch(!!sess.domOverlayState);
  sess.addEventListener('end', () => {
    impostaModoTouch(false);
    $('pannello').style.display = '';
  });
}

$('entra').addEventListener('click', async () => {
  const { punto, turbine } = selezione();
  mondoAttivo = popolaMondo(mondo, punto, turbine);
  mondoAttivo.punto = punto; mondoAttivo.azIniziale = punto.baricentro?.az ?? turbine[0]?.az ?? 0;
  stato.iB = 0; inizializzato = false; fantasmiOn = false; etichetteOn = true;
  $('tEtichette').classList.add('on'); $('tFantasmi').classList.remove('on');

  try {
    if (supportato) {
      await avviaAR();
    } else {
      mondo.position.y = 0;
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
let tPrec = 0;
renderer.setAnimationLoop(t => {
  const dt = Math.min(0.1, (t - tPrec) / 1000 || 0); tPrec = t;
  if (mondoAttivo) {
    if (!inizializzato) { ctrl.allineaAz(mondoAttivo.azIniziale); inizializzato = true; }
    ctrl.aggiorna(dt);
    mondo.rotation.y = stato.theta;
    for (const r of mondoAttivo.rotori) r.rotation.z -= dt * 2 * Math.PI * 10 / 60;   // 10 giri/min
    const b = mondoAttivo.bersagli[stato.iB];
    const righe = [
      `${mondoAttivo.punto.id}  ·  vista ${ctrl.azTesta().toFixed(1)}°N  ·  rot. ${deg(stato.theta).toFixed(1)}°`,
      b ? `Bersaglio: ${b.nome} (${b.az.toFixed(1)}°)  Δ ${ctrl.scarto(b.az).toFixed(2)}°` : 'nessun bersaglio',
      fantasmiOn ? 'parti nascoste: visibili' : ''
    ];
    if (modoTouch) touch.testo(righe); else hud.imposta(righe);
  }
  renderer.render(scene, camera);
});
