// Zefiro AR – terreno compatto (campo 'terreno' dell'export) e punto libero da GPS.
// Calcola sul telefono ciò che il plugin precalcola per i punti di scatto fissi:
// quota del punto, profilo d'orizzonte, metri visibili di ogni turbina, riferimenti.
// Stesse formule di core/export_campo_ar.py (curvatura + rifrazione, k = 0,13).
import { azDist, abbassamento, rad, deg, norm360, H_OCCHIO } from './geo.js?v=202610261356';

const RAGGIO = 25000, PASSO_AZ = 0.5, D_MIN_RIF = 50;

// base64 → gzip → uint16 differenze → quote (Float32, NaN = nessun dato)
export async function decodificaTerreno(t) {
  if (!t?.dati || t.formato !== 'u16-delta-gzip-b64') return null;
  if (typeof DecompressionStream === 'undefined') throw new Error('browser troppo vecchio (manca DecompressionStream)');
  const bin = Uint8Array.from(atob(t.dati), c => c.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const d = new Uint16Array(buf);
  const z = new Float32Array(d.length);
  let acc = 0;
  for (let i = 0; i < d.length; i++) {
    acc = (acc + d[i]) & 0xffff;
    z[i] = acc === t.nodata ? NaN : t.zmin + acc * t.scala;
  }
  const { dati, ...resto } = t;
  return { ...resto, z };
}

// quota bilineare in (lon, lat); NaN fuori griglia
export function quota(T, lon, lat) {
  const c = (lon - T.lon0) / T.dlon, r = (T.lat0 - lat) / T.dlat;
  if (!(c >= 0 && r >= 0 && c <= T.nx - 1 && r <= T.ny - 1)) return NaN;
  const c0 = Math.min(T.nx - 2, Math.floor(c)), r0 = Math.min(T.ny - 2, Math.floor(r));
  const fc = c - c0, fr = r - r0, i = r0 * T.nx + c0, z = T.z, nx = T.nx;
  return z[i] * (1 - fc) * (1 - fr) + z[i + 1] * fc * (1 - fr) + z[i + nx] * (1 - fc) * fr + z[i + nx + 1] * fc * fr;
}

function distanze(passo, dMax, dMin = 30) {
  const o = [];
  for (let d = dMin; d < dMax; d += Math.max(passo, d * 0.002)) o.push(d);
  return o;
}

// fattori del piano locale attorno al punto (stesso modello di azDist)
function piano(lon0, lat0) {
  const a = 6378137, e2 = 0.00669437999014, f = rad(lat0), s = Math.sin(f);
  const w = Math.sqrt(1 - e2 * s * s);
  return { kE: deg(1) / (a / w * Math.cos(f)), kN: deg(1) / (a * (1 - e2) / (w * w * w)) };  // gradi per metro
}

// pendenza massima del terreno (rispetto all'occhio) lungo un azimut fino a dMax
function pendenzaMax(T, lon, lat, zO, az, dMax, kE, kN, ds) {
  const sA = Math.sin(rad(az)), cA = Math.cos(rad(az));
  let best = -Infinity, dBest = 0;
  for (const d of ds) {
    if (d >= dMax) break;
    const z = quota(T, lon + d * sA * kE, lat + d * cA * kN);
    if (z !== z) continue;                                     // NaN
    const t = (z - abbassamento(d) - zO) / d;
    if (t > best) { best = t; dBest = d; }
  }
  return { tg: best, d: dBest };
}

export function profiloOrizzonte(T, lon, lat, zO, raggio = RAGGIO, passoAz = PASSO_AZ) {
  const { kE, kN } = piano(lon, lat);
  const ds = distanze(T.passo_m / 2, raggio);
  const elev = [], dist = [];
  for (let az = 0; az < 360 - 1e-9; az += passoAz) {
    const { tg, d } = pendenzaMax(T, lon, lat, zO, az, raggio, kE, kN, ds);
    elev.push(tg === -Infinity ? 0 : +deg(Math.atan(tg)).toFixed(3));
    dist.push(+(d / 1000).toFixed(2));
  }
  return { passo: passoAz, elev, dist };
}

// metri visibili di un oggetto alto h con base a quota zBase (come quota_visibile del plugin)
export function quotaVisibile(T, lon, lat, zO, az, dist, zBase, h) {
  const { kE, kN } = piano(lon, lat);
  const { tg } = pendenzaMax(T, lon, lat, zO, az, dist - 60, kE, kN, distanze(T.passo_m / 2, dist - 60));
  if (tg === -Infinity) return h;
  const yMin = tg * dist + abbassamento(dist) + zO - zBase;
  return +Math.min(h, Math.max(0, h - yMin)).toFixed(1);
}

// media circolare degli azimut
function azMedio(az) {
  if (!az.length) return 0;
  const x = az.reduce((s, a) => s + Math.sin(rad(a)), 0), y = az.reduce((s, a) => s + Math.cos(rad(a)), 0);
  return norm360(deg(Math.atan2(x, y)));
}

// Punto di vista libero (posizione GPS) con gli stessi campi di un punto dell'export
export function puntoLibero(prog, T, fix) {
  const { lon, lat } = fix;
  const id = `GPS ±${Math.round(fix.acc ?? 0)} m`;
  const base = { id, etichetta: 'Posizione attuale', lon, lat, alt_oss: H_OCCHIO };
  if (!T) {                                                    // export senza terreno
    return { ...base, baricentro: { az: azMedio(prog.turbine.map(t => azDist(lon, lat, t.lon, t.lat).az)) } };
  }
  const z = quota(T, lon, lat);
  if (z !== z) throw new Error('la posizione è fuori dall\'area del terreno esportato');
  const zO = z + H_OCCHIO;
  const visibili = prog.turbine.map(t => {
    const { az, dist } = azDist(lon, lat, t.lon, t.lat);
    const zb = t.zBase ?? quota(T, t.lon, t.lat);
    return { id: t.id, az, dist, h_vis: zb === zb ? quotaVisibile(T, lon, lat, zO, az, dist, zb, t.h) : t.h };
  });
  const riferimenti = (prog.riferimentiNoti ?? []).map(r => {
    const { az, dist } = azDist(lon, lat, r.lon, r.lat);
    if (dist < D_MIN_RIF || dist > RAGGIO) return null;
    const elev = deg(Math.atan2(r.z_base + r.h - abbassamento(dist) - zO, dist));
    const vis = quotaVisibile(T, lon, lat, zO, az, dist, r.z_base, Math.max(r.h, 0.5)) > 0;
    return { nome: r.nome, az: +az.toFixed(3), elev: +elev.toFixed(3), dist: Math.round(dist), visibile: vis };
  }).filter(Boolean).sort((a, b) => (a.visibile === b.visibile ? a.dist - b.dist : a.visibile ? -1 : 1));
  const viste = visibili.filter(v => v.h_vis > 0);
  return {
    ...base, z: +z.toFixed(2),
    orizzonte: profiloOrizzonte(T, lon, lat, zO),
    visibili, riferimenti,
    baricentro: { az: azMedio((viste.length ? viste : visibili).map(v => v.az)) }
  };
}
