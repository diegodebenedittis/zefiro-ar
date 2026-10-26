// Zefiro AR – taratura a 2 punti (modalità fotocamera).
// Fotogramma congelato; l'utente tocca sullo schermo i due bersagli reali A e B.
// Noto l'angolo vero fra A e B (azimut + elevazione dai dati) e la loro posizione in pixel,
// si ricavano insieme: focale → campo visivo, e orientamento (rotazione del mondo).
import * as THREE from 'three';
import { rad, deg, norm360, yawDiVettore } from './geo.js?v=202610260801';

const ANG_MIN = 3;       // gradi: sotto, i due bersagli sono troppo vicini per tarare il campo

// versore di un azimut/elevazione (stesso riferimento della scena: -z = Nord, x = Est)
function versore(az, el) {
  const a = rad(az), e = rad(el);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

export function creaTaratura(svg, cam, cb) {
  let fase = null, iA = 0, iBt = 1, pA = null, pB = null, qSnap = null, ris = null;
  const $ = s => svg.querySelector(s);

  function disegna() {
    svg.hidden = !fase;
    const mostra = (sel, p) => { const c = $(sel); c.style.display = p ? '' : 'none'; if (p) { c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); } };
    mostra('#tarA', pA); mostra('#tarB', pB);
    const l = $('#tarLinea');
    l.style.display = pA && pB ? '' : 'none';
    if (pA && pB) { l.setAttribute('x1', pA[0]); l.setAttribute('y1', pA[1]); l.setAttribute('x2', pB[0]); l.setAttribute('y2', pB[1]); }
  }

  // raggio nel mondo (prima della rotazione della scena) del pixel p con focale f (px CSS)
  function raggio(p, f) {
    const W = innerWidth, H = innerHeight;
    return new THREE.Vector3(p[0] - W / 2, H / 2 - p[1], -f).normalize().applyQuaternion(qSnap);
  }

  function calcola() {
    const bb = cb.bersagli(), A = bb[iA], B = bb[iBt];
    const vera = versore(A.az, A.el ?? 0).angleTo(versore(B.az, B.el ?? 0));
    if (deg(vera) < ANG_MIN) { ris = { errore: `bersagli troppo vicini (${deg(vera).toFixed(1)}°): scegline due più distanti` }; return; }
    const rA = q => new THREE.Vector3(pA[0] - innerWidth / 2, innerHeight / 2 - pA[1], -q);
    const rB = q => new THREE.Vector3(pB[0] - innerWidth / 2, innerHeight / 2 - pB[1], -q);
    if (Math.hypot(pA[0] - pB[0], pA[1] - pB[1]) < 30) { ris = { errore: 'i due punti toccati sono troppo vicini' }; return; }
    // l'angolo fra i raggi decresce con la focale: bisezione
    let lo = 20, hi = 50000;
    for (let i = 0; i < 80; i++) {
      const f = Math.sqrt(lo * hi);
      if (rA(f).angleTo(rB(f)) > vera) lo = f; else hi = f;
    }
    const f = Math.sqrt(lo * hi);
    const fovV = 2 * deg(Math.atan((innerHeight / 2) / f));
    if (fovV < 15 || fovV > 120) { ris = { errore: `risultato non plausibile (campo ${fovV.toFixed(0)}°): ritocca i punti` }; return; }
    // orientamento: per ciascun bersaglio, rotazione che porta il suo azimut vero sul raggio toccato
    const wA = raggio(pA, f), wB = raggio(pB, f);
    const tA = yawDiVettore(wA) + rad(A.az), tB = yawDiVettore(wB) + rad(B.az);
    const theta = Math.atan2(Math.sin(tA) + Math.sin(tB), Math.cos(tA) + Math.cos(tB));
    const dTheta = deg(Math.atan2(Math.sin(tA - tB), Math.cos(tA - tB)));      // incoerenza (rollio)
    const dEl = (deg(Math.asin(wA.y)) - (A.el ?? 0) + deg(Math.asin(wB.y)) - (B.el ?? 0)) / 2;
    ris = { theta, fovV, dTheta, dEl, ang: deg(vera) };
  }

  function fine() {
    fase = null; pA = pB = ris = null;
    cam.blocca(false);
    disegna();
  }

  return {
    get attiva() { return !!fase; },
    avvia(iCorr) {
      const bb = cb.bersagli();
      if (bb.length < 2) { cb.messaggio('Servono almeno 2 bersagli (turbine o riferimenti noti)'); return; }
      iA = iCorr; iBt = (iA + 1) % bb.length;
      qSnap = cam.blocca(true);                  // congela fotogramma e orientamento
      pA = pB = ris = null; fase = 'A';
      disegna();
    },
    tocco(x, y) {
      if (fase === 'A') { pA = [x, y]; fase = 'B'; }
      else if (fase === 'B') { pB = [x, y]; fase = 'pronto'; calcola(); }
      else if (fase === 'pronto') {               // ritocco: sposta il punto più vicino
        const dA = Math.hypot(x - pA[0], y - pA[1]), dB = Math.hypot(x - pB[0], y - pB[1]);
        if (dA < dB) pA = [x, y]; else pB = [x, y];
        calcola();
      }
      disegna();
    },
    cambiaB() {
      const n = cb.bersagli().length;
      do { iBt = (iBt + 1) % n; } while (iBt === iA && n > 1);
      if (fase === 'pronto') calcola();
    },
    guida() {
      const bb = cb.bersagli();
      if (fase === 'A') return `Taratura · tocca sullo schermo il punto reale di «${bb[iA].nome}»`;
      if (fase === 'B') return `Ora tocca «${bb[iBt].nome}» (Bersaglio = scegline un altro)`;
      if (!ris) return '';
      if (ris.errore) return 'Taratura: ' + ris.errore;
      return `Campo ${ris.fovV.toFixed(1)}° vert. · angolo A–B ${ris.ang.toFixed(2)}° · Δ elev ${ris.dEl.toFixed(2)}°` +
        (Math.abs(ris.dTheta) > 0.3 ? ` · incoerenza ${ris.dTheta.toFixed(2)}° (telefono storto?)` : '') + ' · Applica';
    },
    applica() {
      if (!ris || ris.errore) { cb.messaggio('Tocca prima i due bersagli'); return false; }
      cb.applica(ris);
      fine();
      return true;
    },
    annulla: fine
  };
}
