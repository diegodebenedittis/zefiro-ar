// Zefiro AR – modalità fotocamera (telefoni senza WebXR AR funzionante)
// Video della fotocamera posteriore come sfondo + orientamento dal giroscopio
// (deviceorientation relativo: inclinazione assoluta dalla gravità, direzione
// allineata a mano come sul Quest). Il campo visivo della fotocamera si regola
// con "Campo −/+" e resta salvato sul telefono.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const CHIAVE_FOV = 'zefiroAR.fov';
const FOV_DEFAULT = 67;      // campo visivo sul lato lungo, obiettivo principale ~26 mm eq.

function leggiFov() {
  try { return +localStorage.getItem(CHIAVE_FOV) || FOV_DEFAULT; } catch { return FOV_DEFAULT; }
}

export function creaFotocamera(video, camera) {
  let stream = null, ultimo = 0, attivo = false, primo = true;
  let fovLungo = leggiFov();
  const q = new THREE.Quaternion(), qT = new THREE.Quaternion(), eul = new THREE.Euler();
  const q0 = new THREE.Quaternion(), zee = new THREE.Vector3(0, 0, 1);
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));   // camera verso il retro

  function suOrient(e) {
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
      addEventListener('resize', suResize);
      screen.orientation?.addEventListener?.('change', suResize);
      aggiornaFov();
      attivo = true;
    },
    // da chiamare a ogni frame prima del rendering
    aggiorna() {
      if (!attivo || !ultimo) return;
      if (primo) { q.copy(qT); primo = false; } else q.slerp(qT, 0.35);   // smorza il tremolio
      camera.quaternion.copy(q);
    },
    get pronto() { return attivo && ultimo > 0; },
    get fermo() { return attivo && ultimo > 0 && performance.now() - ultimo > 2000; },
    get fov() { return fovLungo; },
    regolaFov(d) {
      fovLungo = Math.min(120, Math.max(20, Math.round((fovLungo + d) * 10) / 10));
      try { localStorage.setItem(CHIAVE_FOV, fovLungo); } catch { /* memoria non disponibile */ }
      aggiornaFov();
    },
    ferma() {
      stream?.getTracks().forEach(t => t.stop());
      removeEventListener('deviceorientation', suOrient);
      removeEventListener('resize', suResize);
      video.hidden = true; attivo = false;
    }
  };
}
