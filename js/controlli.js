// Zefiro AR – comandi: controller Quest, pulsanti a schermo (telefono), tastiera/mouse (anteprima)
import * as THREE from 'three';
import { rad, deg, norm360, norm180, yawDiVettore } from './geo.js?v=202610251555';

const V_NORM = 3, V_FINE = 0.2, ZONA_MORTA = 0.15;   // °/s

// stato: { theta (rad, rotazione del mondo), iB (bersaglio corrente) }
// touch: oggetto di creaTouch() oppure null
export function creaControlli(renderer, camera, stato, azioni, touch) {
  const prec = new Map();
  const tasti = new Set();
  let yawDesk = 0, pitchDesk = 0, trascina = null;

  // --- tastiera / trascinamento (anteprima senza AR, anche col dito)
  addEventListener('keydown', e => {
    tasti.add(e.key);
    if (e.key === 'Enter') azioni.allinea();
    if (e.key === ' ') azioni.successivo();
    if (e.key === 'h') azioni.etichette();
    if (e.key === 'g') azioni.fantasmi();
  });
  addEventListener('keyup', e => tasti.delete(e.key));
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => trascina = [e.clientX, e.clientY, yawDesk, pitchDesk]);
  addEventListener('pointerup', () => trascina = null);
  addEventListener('pointercancel', () => trascina = null);
  addEventListener('pointermove', e => {
    if (!trascina || renderer.xr.isPresenting || stato.sensori) return;
    yawDesk = trascina[2] + (e.clientX - trascina[0]) * 0.003;
    pitchDesk = Math.max(-1.2, Math.min(1.2, trascina[3] + (e.clientY - trascina[1]) * 0.003));
  });

  const premuto = (chiave, b) => { const p = prec.get(chiave); prec.set(chiave, b); return b && !p; };

  function yawTesta() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    return yawDiVettore(cam.getWorldDirection(new THREE.Vector3()));
  }

  function controllerQuest(dt) {
    const sess = renderer.xr.getSession();
    for (const src of sess?.inputSources ?? []) {
      const gp = src.gamepad; if (!gp) continue;
      const h = src.handedness, b = i => !!gp.buttons[i]?.pressed;
      const x = gp.axes[2] ?? 0;
      if (Math.abs(x) > ZONA_MORTA) {
        const v = b(1) ? V_FINE : V_NORM;
        stato.theta -= rad(v * dt) * Math.sign(x) * (Math.abs(x) - ZONA_MORTA) / (1 - ZONA_MORTA);
      }
      if (premuto(h + 0, b(0))) azioni.allinea();     // grilletto
      if (premuto(h + 4, b(4))) azioni.successivo();  // A / X
      if (premuto(h + 5, b(5))) azioni.etichette();   // B / Y
      if (premuto(h + 3, b(3))) azioni.fantasmi();    // pressione stick
    }
  }

  return {
    yawTesta,
    // azimut geografico verso cui si guarda
    azTesta: () => norm360(deg(stato.theta - yawTesta())),
    // ruota il mondo perché l'azimut az cada al centro del mirino
    allineaAz(az) { stato.theta = yawTesta() + rad(az); },

    aggiorna(dt) {
      if (touch?.dir) stato.theta += rad((touch.fine ? V_FINE : V_NORM) * dt) * touch.dir;
      if (renderer.xr.isPresenting) { controllerQuest(dt); return; }
      if (!stato.sensori) camera.rotation.set(pitchDesk, yawDesk, 0, 'YXZ');   // altrimenti: giroscopio
      const v = tasti.has('Shift') ? V_FINE : V_NORM;
      if (tasti.has('ArrowRight')) stato.theta -= rad(v * dt);
      if (tasti.has('ArrowLeft')) stato.theta += rad(v * dt);
    },
    scarto: az => norm180(norm360(deg(stato.theta - yawTesta())) - az)
  };
}
