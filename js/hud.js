// Zefiro AR – testi (etichette, HUD, mirino)
import * as THREE from 'three';

function canvasTesto(righe, { larg = 512, alt = 128, font = 44, sfondo = 'rgba(0,0,0,0.55)', colore = '#ffd400' } = {}) {
  const c = document.createElement('canvas'); c.width = larg; c.height = alt;
  const g = c.getContext('2d');
  if (sfondo) { g.fillStyle = sfondo; g.fillRect(0, 0, larg, alt); }
  g.fillStyle = colore; g.font = `600 ${font}px system-ui,sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = alt / righe.length;
  righe.forEach((r, i) => g.fillText(r, larg / 2, lh * (i + 0.5)));
  return c;
}

// Etichetta a dimensione angolare costante (altezza angolare in gradi)
export function etichetta(testo, pos, angGradi = 0.7) {
  const tex = new THREE.CanvasTexture(canvasTesto([testo], { larg: 256, alt: 64, font: 40 }));
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const d = Math.hypot(pos.x, pos.z), h = d * Math.tan(angGradi * Math.PI / 180);
  s.scale.set(h * 4, h, 1);
  s.center.set(0.5, 0);
  s.position.copy(pos);
  s.renderOrder = 10;
  return s;
}

// Pannello HUD agganciato alla camera
export function creaHud(camera) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  m.position.set(0, -0.32, -1.2); m.renderOrder = 20;
  camera.add(m);

  const mir = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.013, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false }));
  mir.position.set(0, 0, -1); mir.renderOrder = 21;
  const matC = new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false });
  const croce = new THREE.Mesh(new THREE.PlaneGeometry(0.003, 0.05), matC);
  const croceH = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.003), matC);
  for (const o of [croce, croceH]) { o.position.set(0, 0, -1); o.renderOrder = 21; }
  camera.add(mir, croce, croceH);

  let ultimo = '';
  return {
    imposta(righe) {
      const k = righe.join('|'); if (k === ultimo) return; ultimo = k;
      const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      g.drawImage(canvasTesto(righe.filter(Boolean), { larg: 1024, alt: 320, font: 40, colore: '#ffffff' }), 0, 0);
      tex.needsUpdate = true;
    },
    set visibile(v) { m.visible = v; },
    posizione(x, y, z) { m.position.set(x, y, z); }
  };
}
