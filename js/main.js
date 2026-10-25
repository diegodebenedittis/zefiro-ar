// Zefiro AR – avvio, interfaccia, ciclo di rendering
import { leggiProgetto, turbinePerPunto, infoPunto, datiDemo } from './dati.js';
import { creaScena, popolaMondo } from './scena.js';
import { creaControlli } from './controlli.js';
import { creaHud } from './hud.js';
import { deg } from './geo.js';

const $ = id => document.getElementById(id);
const { renderer, scene, camera, mondo } = creaScena(document.body);
renderer.domElement.style.display = 'none';

let prog = null, mondoAttivo = null, inizializzato = false, etichetteOn = true, fantasmiOn = false;
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
    hud.visibile = etichetteOn;
  },
  fantasmi() {
    fantasmiOn = !fantasmiOn;
    mondoAttivo?.fantasmi.forEach(f => f.visible = fantasmiOn);
  }
};
const ctrl = creaControlli(renderer, camera, stato, azioni);

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

// ---------- avvio sessione
const supportato = navigator.xr ? await navigator.xr.isSessionSupported('immersive-ar').catch(() => false) : false;
$('entra').disabled = false;
$('entra').textContent = supportato ? 'Entra in AR' : 'Anteprima desktop (WebXR AR non disponibile)';
$('stato').textContent = supportato
  ? 'Entrando, guarda verso il parco: la scena parte centrata sul baricentro, poi allinea.'
  : 'Anteprima: trascina per guardarti intorno · ←/→ ruota (Shift = fine) · Invio allinea · Spazio bersaglio · h etichette · g fantasmi';

$('entra').addEventListener('click', async () => {
  const { punto, turbine } = selezione();
  mondoAttivo = popolaMondo(mondo, punto, turbine);
  mondoAttivo.punto = punto; mondoAttivo.azIniziale = punto.baricentro?.az ?? turbine[0]?.az ?? 0;
  stato.iB = 0; inizializzato = false; fantasmiOn = false; etichetteOn = true;

  if (supportato) {
    const sess = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(sess);
    renderer.xr.getReferenceSpace()?.addEventListener('reset', () => inizializzato = false);
    sess.addEventListener('end', () => { $('pannello').style.display = ''; });
    $('pannello').style.display = 'none';
  } else {
    $('pannello').style.display = 'none';
    renderer.domElement.style.display = 'block';
    addEventListener('keydown', e => { if (e.key === 'Escape') location.reload(); });
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
    hud.imposta([
      `${mondoAttivo.punto.id}  ·  vista ${ctrl.azTesta().toFixed(1)}°N  ·  rot. ${deg(stato.theta).toFixed(1)}°`,
      b ? `Bersaglio: ${b.nome} (${b.az.toFixed(1)}°)  Δ ${ctrl.scarto(b.az).toFixed(2)}°` : 'nessun bersaglio',
      fantasmiOn ? 'parti nascoste: visibili' : ''
    ]);
  }
  renderer.render(scene, camera);
});
