// Zefiro AR – modello di aerogeneratore (metri reali; rotore sul lato +z)
import * as THREE from 'three';

function geomPala(R, D) {
  const cm = 0.05 * R, r0 = 0.012 * D;
  const s = new THREE.Shape();
  s.moveTo(-r0, 0); s.lineTo(r0, 0);
  s.lineTo(cm * 0.35, 0.2 * R); s.lineTo(cm * 0.15, 0.6 * R); s.lineTo(cm * 0.04, R);
  s.lineTo(-cm * 0.02, R); s.lineTo(-cm * 0.4, 0.6 * R); s.lineTo(-cm * 0.65, 0.2 * R);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004 * D, bevelEnabled: false });
  g.translate(0, 0, -0.002 * D);
  return g;
}

// Restituisce { gruppo, rotore }. Dimensioni: hub = altezza mozzo, D = diametro rotore
export function creaTurbina({ hub, D }, materiale) {
  const gruppo = new THREE.Group();
  const rBase = Math.max(2.2, 0.028 * D), rTop = Math.max(1.4, 0.014 * D);

  const torre = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBase, hub, 24), materiale);
  torre.position.y = hub / 2;

  const nav = new THREE.Mesh(new THREE.BoxGeometry(0.028 * D, 0.028 * D, 0.09 * D), materiale);
  nav.position.set(0, hub, -0.015 * D);

  const rotore = new THREE.Group();
  rotore.position.set(0, hub, 0.04 * D);
  const ogiva = new THREE.Mesh(new THREE.SphereGeometry(0.022 * D, 16, 12), materiale);
  rotore.add(ogiva);
  const gp = geomPala(D / 2 - 0.015 * D, D);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(gp, materiale);
    p.position.y = 0;
    const perno = new THREE.Group();
    perno.rotation.z = i * 2 * Math.PI / 3;
    p.position.y = 0.015 * D;
    perno.add(p);
    rotore.add(perno);
  }
  rotore.rotation.z = Math.random() * Math.PI;
  gruppo.add(torre, nav, rotore);
  return { gruppo, rotore };
}
