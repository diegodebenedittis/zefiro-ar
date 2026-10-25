// Zefiro AR – lettura Sopralluogo_dati.json (formato zefiro-campo v1, campi AR facoltativi)
import { azDist, abbassamento, H_OCCHIO } from './geo.js?v=202610251915';

function turbinaNorm(t) {
  const h = +t.h;
  const D = +(t.rotore ?? t.D ?? 0) || 0.8 * h;           // se manca: stima tipica
  const hub = +(t.mozzo ?? t.hub ?? 0) || (h - D / 2);
  return { id: String(t.id), lon: +t.lon, lat: +t.lat, h: hub + D / 2, hub, D,
           zBase: t.z_base != null ? +t.z_base : null };
}

export function leggiProgetto(json) {
  if (!Array.isArray(json.punti) || !Array.isArray(json.turbine))
    throw new Error('File non valido: mancano "punti" o "turbine"');
  const turbine = json.turbine.map(turbinaNorm);
  const avvisi = [];
  if (json.turbine.some(t => t.mozzo == null)) avvisi.push('mozzo/rotore stimati (export senza campi AR)');
  return { nome: json.progetto ?? 'Progetto', turbine, punti: json.punti, avvisi,
           terrenoGrezzo: json.terreno ?? null, riferimentiNoti: json.riferimenti_noti ?? [] };
}

// Turbine viste da un punto: azimut, distanza, dislivello base rispetto all'occhio, quota visibile
export function turbinePerPunto(prog, p) {
  const zMedia = prog.turbine.reduce((s, t) => s + (t.zBase ?? 0), 0) / prog.turbine.length;
  const zPunto = p.z != null ? +p.z : null;
  const zOcchio = (zPunto ?? zMedia) + (+p.alt_oss > 0 ? +p.alt_oss : H_OCCHIO);
  const vis = new Map((p.visibili ?? []).map(v => [String(v.id), v]));
  const conVisibili = Array.isArray(p.visibili);
  return prog.turbine.map(t => {
    const { az, dist } = azDist(+p.lon, +p.lat, t.lon, t.lat);
    const dz = (t.zBase ?? zMedia) - abbassamento(dist) - zOcchio;
    const v = vis.get(t.id);
    const hVis = v ? (v.h_vis != null ? +v.h_vis : t.h) : (conVisibili ? 0 : t.h);
    return { ...t, az, dist, dz, hVis };
  });
}

export function infoPunto(prog, p) {
  const tt = turbinePerPunto(prog, p);
  const vis = tt.filter(t => t.hVis > 0).length;
  const dmin = Math.min(...tt.map(t => t.dist));
  const noZ = p.z == null ? ' · quota punto assente (assunta pari alle basi)' : '';
  const noOr = p.orizzonte ? '' : ' · profilo d\'orizzonte assente';
  return `${tt.length} turbine, ${vis} visibili, più vicina ${(dmin / 1000).toFixed(2)} km${noZ}${noOr}`;
}

// Punto/turbina di prova dai campi del modulo
export function datiDemo(v) {
  const t = { id: 'T-prova', h: v.h, hub: v.hub, D: v.D, az: v.az, dist: v.dist,
              dz: v.dz - abbassamento(v.dist) - H_OCCHIO, hVis: v.h };
  return { punto: { id: 'prova', etichetta: 'Prova', baricentro: { az: v.az } }, turbine: [t] };
}
