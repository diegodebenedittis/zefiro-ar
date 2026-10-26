// Zefiro AR – modalità fotocamera (telefoni senza WebXR AR funzionante)
// Video della fotocamera posteriore come sfondo + orientamento dal giroscopio
// (deviceorientation relativo: inclinazione assoluta dalla gravità, direzione
// allineata a mano come sul Quest). Il campo visivo della fotocamera si regola
// con "Campo −/+" e resta salvato sul telefono.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const CHIAVE_FOV = 'zefiroAR.fov';
const CHIAVE_ALZO = 'zefiroAR.alzo';     // correzione verticale (gradi): errore d'inclinazione del sensore
const FOV_DEFAULT = 67;      // campo visivo sul lato lungo, obiettivo principale ~26 mm eq.

function leggiFov() {
  try { return +localStorage.getItem(CHIAVE_FOV) || FOV_DEFAULT; } catch { return FOV_DEFAULT; }
}

export function creaFotocamera(video, camera) {
  let stream = null, ultimo = 0, attivo = false, primo = true, bloccato = false;
  let fovLungo = leggiFov();
  let alzo = 0;
  try { alzo = +localStorage.getItem(CHIAVE_ALZO) || 0; } catch { /* memoria non disponibile */ }
  const qAlzo = new THREE.Quaternion(), asseX = new THREE.Vector3(1, 0, 0);
  const salvaAlzo = () => { try { localStorage.setItem(CHIAVE_ALZO, alzo); } catch { /* */ } };
  const q = new THREE.Quaternion(), qT = new THREE.Quaternion(), eul = new THREE.Euler();
  const q0 = new THREE.Quaternion(), zee = new THREE.Vector3(0, 0, 1);
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));   // camera verso il retro

  // Bussola: direzione magnetica della fotocamera, media degli ultimi campioni
  const qA = new THREE.Quaternion(), avanti = new THREE.Vector3();
  let campioni = [];
  function aggiungiRotta(h) {
    campioni.push([performance.now(), Math.sin(h * DEG), Math.cos(h * DEG)]);
    const lim = performance.now() - 1000;
    campioni = campioni.filter(c => c[0] > lim).slice(-30);
  }
  function quaternione(qOut, e) {
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * DEG;
    eul.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    return qOut.setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
  }
  function suAssoluto(e) {                     // Android: alpha riferito al nord magnetico
    if (e.alpha == null || e.absolute === false) return;
    avanti.set(0, 0, -1).applyQuaternion(quaternione(qA, e));
    if (Math.hypot(avanti.x, avanti.z) < 0.3) return;          // fotocamera quasi verticale
    aggiungiRotta(((Math.atan2(avanti.x, -avanti.z) / DEG) + 360) % 360);
  }

  function suOrient(e) {
    if (e.webkitCompassHeading != null) aggiungiRotta(e.webkitCompassHeading);   // iPhone
    if (e.alpha == null) return;
    ultimo = performance.now();
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * DEG;
    eul.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    qT.setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
  }

  // campo visivo verticale della porzione di video visibile (object-fit: cover)
  function aggiornaFov() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const W = innerWidth, H = innerHeight;
    const f = (Math.max(vw, vh) / 2) / Math.tan(fovLungo * DEG / 2);      // focale in pixel video
    const s = Math.max(W / vw, H / vh);                                    // scala di "cover"
    camera.fov = 2 * Math.atan((H / s / 2) / f) / DEG;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  const suResize = () => setTimeout(aggiornaFov, 150);

  return {
    async avvia() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('fotocamera non accessibile da questo browser');
      // iPhone: il permesso ai sensori va chiesto dentro il tocco
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('permesso ai sensori negato');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = stream;
      video.hidden = false;
      video.addEventListener('loadedmetadata', aggiornaFov);
      await video.play();
      addEventListener('deviceorientation', suOrient);
      addEventListener('deviceorientationabsolute', suAssoluto);
      addEventListener('resize', suResize);
      screen.orientation?.addEventListener?.('change', suResize);
      aggiornaFov();
      attivo = true;
    },
    // da chiamare a ogni frame prima del rendering
    aggiorna() {
      if (!attivo || !ultimo || bloccato) return;
      if (primo) { q.copy(qT); primo = false; } else q.slerp(qT, 0.35);   // smorza il tremolio
      camera.quaternion.copy(q);
      // alzo > 0: la scena sale (la fotocamera virtuale si inclina verso il basso)
      if (alzo) camera.quaternion.multiply(qAlzo.setFromAxisAngle(asseX, -alzo * DEG));
    },
    // direzione magnetica media della fotocamera (gradi) o null se la bussola non risponde
    get bussola() {
      if (!campioni.length || performance.now() - campioni[campioni.length - 1][0] > 1500) return null;
      const x = campioni.reduce((a, c) => a + c[1], 0), y = campioni.reduce((a, c) => a + c[2], 0);
      return ((Math.atan2(x, y) / DEG) + 360) % 360;
    },
    get pronto() { return attivo && ultimo > 0; },
    get fermo() { return attivo && ultimo > 0 && performance.now() - ultimo > 2000; },
    get fov() { return fovLungo; },
    get alzo() { return alzo; },
    regolaAlzo(d) { alzo = Math.max(-10, Math.min(10, Math.round((alzo + d) * 100) / 100)); salvaAlzo(); },
    azzeraAlzo() { alzo = 0; salvaAlzo(); },
    // congela fotogramma e orientamento (taratura); restituisce l'orientamento congelato
    blocca(v) {
      bloccato = v;
      if (v) video.pause(); else video.play().catch(() => {});
      return camera.quaternion.clone();
    },
    // imposta il campo visivo dal valore verticale misurato sullo schermo (gradi)
    impostaFovVerticale(fv) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const s = Math.max(innerWidth / vw, innerHeight / vh);
      const fVid = ((innerHeight / 2) / Math.tan(fv * DEG / 2)) / s;
      fovLungo = Math.round(2 * Math.atan((Math.max(vw, vh) / 2) / fVid) / DEG * 10) / 10;
      try { localStorage.setItem(CHIAVE_FOV, fovLungo); } catch { /* memoria non disponibile */ }
      aggiornaFov();
    },
    regolaFov(d) {
      fovLungo = Math.min(120, Math.max(20, Math.round((fovLungo + d) * 10) / 10));
      try { localStorage.setItem(CHIAVE_FOV, fovLungo); } catch { /* memoria non disponibile */ }
      aggiornaFov();
    },
    ferma() {
      stream?.getTracks().forEach(t => t.stop());
      removeEventListener('deviceorientation', suOrient);
      removeEventListener('deviceorientationabsolute', suAssoluto);
      removeEventListener('resize', suResize);
      video.hidden = true; attivo = false;
    }
  };
}
