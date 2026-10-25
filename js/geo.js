// Zefiro AR – geometria: azimut/distanze, curvatura, compressione distanze
export const R_TERRA = 6371000;
export const K_RIFR = 0.13;      // coefficiente di rifrazione standard
export const H_OCCHIO = 1.6;     // quota occhio sul terreno (m)

const DEG = Math.PI / 180;
export const rad = d => d * DEG;
export const deg = r => r / DEG;
export const norm360 = a => ((a % 360) + 360) % 360;
export const norm180 = a => { a = norm360(a); return a > 180 ? a - 360 : a; };

// Azimut geografico (°N, orario) e distanza su piano tangente WGS84 (errore trascurabile < 30 km)
export function azDist(lon0, lat0, lon, lat) {
  const a = 6378137, e2 = 0.00669437999014, f = rad(lat0), s = Math.sin(f);
  const w = Math.sqrt(1 - e2 * s * s), N = a / w, M = a * (1 - e2) / (w * w * w);
  const dE = rad(lon - lon0) * N * Math.cos(f), dN = rad(lat - lat0) * M;
  return { az: norm360(deg(Math.atan2(dE, dN))), dist: Math.hypot(dE, dN) };
}

// Abbassamento apparente per curvatura terrestre + rifrazione
export const abbassamento = d => d * d * (1 - K_RIFR) / (2 * R_TERRA);

// Compressione monotona delle distanze in scena: l'oggetto viene scalato
// attorno all'occhio (dimensione angolare invariata) per non perdere precisione di depth.
const D_LIN = 800, C = 250;
export const distanzaScena = d => d <= D_LIN ? d : D_LIN + C * Math.log(1 + (d - D_LIN) / C);

// Direzione locale three.js (x = Est, y = su, -z = Nord) di un azimut geografico
export const dirDaAz = az => [Math.sin(rad(az)), 0, -Math.cos(rad(az))];

// Yaw three.js (rotazione attorno a y, 0 = -z, positivo antiorario) di un vettore
export const yawDiVettore = v => Math.atan2(-v.x, -v.z);
