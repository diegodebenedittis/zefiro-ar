// Zefiro AR – renderer, mondo, turbine, skyline DTM, riferimenti
import * as THREE from 'three';
import { distanzaScena, dirDaAz, rad, deg, H_OCCHIO } from './geo.js?v=202610260839';
import { creaTurbina } from './turbina.js?v=202610260839';
import { etichetta, simbolo } from './hud.js?v=202610260839';

const R_SKY = 470;   // raggio della skyline e dei marker (solo direzione)

export function creaScena(contenitore) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.xr.enabled = true;
  renderer.localClippingEnabled = true;
  contenitore.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
  camera.position.y = H_OCCHIO;
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8590, 1.3));
  const sole = new THREE.DirectionalLight(0xffffff, 1.8); sole.position.set(1, 2, 1);
  scene.add(sole);

  const mondo = new THREE.Group();
  scene.add(mondo);
  addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return { renderer, scene, camera, mondo };
}

const piano = (ny, c) => new THREE.Plane(new THREE.Vector3(0, ny, 0), c);

function puntoSky(az, elev, r = R_SKY) {
  const [x, , z] = dirDaAz(az), ce = Math.cos(rad(elev));
  return new THREE.Vector3(x * r * ce, H_OCCHIO + r * Math.sin(rad(elev)), z * r * ce);
}

// Nastro (spessore angolare costante) lungo una sequenza azimut/elevazione
function nastro(campioni, colore, spessoreGradi = 0.08, opac = 0.85) {
  const pos = [], idx = [];
  campioni.forEach(([az, el], i) => {
    pos.push(...puntoSky(az, el - spessoreGradi / 2).toArray(), ...puntoSky(az, el + spessoreGradi / 2).toArray());
    if (i) { const a = 2 * i - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colore, side: THREE.DoubleSide,
    transparent: true, opacity: opac, depthTest: false }));
  m.renderOrder = 5;
  return m;
}

function svuota(g) {
  while (g.children.length) {
    const o = g.children.pop();
    o.traverse(x => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose?.(); });
  }
}

export function popolaMondo(mondo, punto, turbine) {
  svuota(mondo);
  const rotori = [], fantasmi = [], etichette = [], bersagli = [], piani = [];

  for (const t of turbine) {
    const dS = distanzaScena(t.dist), s = dS / t.dist;
    const [dx, , dz] = dirDaAz(t.az);
    const yBase = H_OCCHIO + s * t.dz;
    const yTaglio = yBase + s * Math.max(0, t.h - t.hVis);   // sotto: nascosto dal terreno

    const pSopra = piano(1, -yTaglio), pSotto = piano(-1, yTaglio);
    piani.push({ p: pSopra, y: yTaglio, s: 1 }, { p: pSotto, y: yTaglio, s: -1 });
    const matPieno = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.55,
      clippingPlanes: [pSopra] });
    const matFant = new THREE.MeshBasicMaterial({ color: 0x55c8ff, transparent: true, opacity: 0.3,
      depthWrite: false, clippingPlanes: [pSotto] });

    for (const [mat, lista] of [[matPieno, null], [matFant, fantasmi]]) {
      if (lista && t.hVis >= t.h) continue;
      const { gruppo, rotore } = creaTurbina(t, mat);
      gruppo.scale.setScalar(s);
      gruppo.position.set(dx * dS, yBase, dz * dS);
      gruppo.rotation.y = -rad(t.az);           // rotore rivolto all'osservatore
      mondo.add(gruppo); rotori.push(rotore);
      if (lista) { gruppo.visible = false; lista.push(gruppo); }
    }
    const e = etichetta(t.id, new THREE.Vector3(dx * dS, yBase + s * t.h * 1.04, dz * dS));
    mondo.add(e); etichette.push(e);
    const elTop = deg(Math.atan2(yBase + s * t.h - H_OCCHIO, dS));   // elevazione della punta pala
    bersagli.push({ nome: `Turbina ${t.id}`, az: t.az, tipo: 't', el: elTop });
  }

  // Skyline del DTM: orizzonte = { passo, elev:[...] } (da azimut 0)
  const o = punto.orizzonte;
  if (o?.elev?.length) {
    const c = o.elev.map((e, i) => [i * o.passo, +e]); c.push([360, +o.elev[0]]);
    const sky = nastro(c, 0xffd400); mondo.add(sky); etichette.push(sky);
  }
  // Graduazione orizzontale ogni 10° e punti cardinali
  for (let a = 0; a < 360; a += 10) {
    const tick = nastro([[a - 0.05, -0.6], [a + 0.05, -0.6]], 0xffffff, a % 90 ? 0.4 : 1.2, 0.5);
    mondo.add(tick); etichette.push(tick);
  }
  [['N', 0], ['E', 90], ['S', 180], ['O', 270]].forEach(([n, a]) => {
    const e = etichetta(n, puntoSky(a, -2.2), 0.9); mondo.add(e); etichette.push(e);
  });
  // Riferimenti noti (metodo A): [{nome, az, elev?}]
  // Riferimenti noti (metodo A): [{nome, az, elev, dist, visibile}] dal plugin.
  // Asta verticale che termina sulla sommità + tacca orizzontale = punto di mira.
  const bRif = [];
  for (const r of punto.riferimenti ?? []) {
    const el = r.elev ?? 0, vis = r.visibile !== false;
    const col = vis ? 0xff4fd8 : 0x8a8a8a, op = vis ? 0.9 : 0.45;
    const asta = nastro([[r.az - 0.03, el - 0.9], [r.az + 0.03, el - 0.9]], col, 1.6, op);
    const tacca = nastro([[r.az - 0.35, el], [r.az + 0.35, el]], col, 0.05, op);
    const km = r.dist ? ` · ${(r.dist / 1000).toFixed(1)} km` : '';
    const e = etichetta(`${r.nome}${km}${vis ? '' : ' (nascosto)'}`, puntoSky(r.az, el + 0.25), 0.55);
    for (const o of [asta, tacca, e]) { mondo.add(o); etichette.push(o); }
    if (vis) bRif.push({ nome: /^rif/i.test(r.nome) ? r.nome : `Rif. ${r.nome}`, az: r.az, tipo: 'r', el });
  }
  bersagli.unshift(...bRif);
  // freccia gialla sopra il bersaglio selezionato
  const freccia = simbolo('▼');
  const lato = R_SKY * Math.tan(rad(1.4));
  freccia.scale.set(lato, lato, 1);
  mondo.add(freccia);
  const segna = b => {
    freccia.visible = !!b;
    if (b) freccia.position.copy(puntoSky(b.az, (b.el ?? 0) + 0.5));
  };
  return { rotori, fantasmi, etichette, bersagli, piani, segna };
}

// La scena segue la testa: l'occhio del mondo (0, H_OCCHIO, 0) coincide con la camera.
// I piani di taglio sono in coordinate mondo: si aggiornano con lo spostamento verticale.
export function seguiTesta(mondo, camera, piani) {
  const c = camera.position;
  mondo.position.set(c.x, c.y - H_OCCHIO, c.z);
  for (const q of piani) q.p.constant = -q.s * (q.y + mondo.position.y);
}
