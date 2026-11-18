// Zefiro AR – modalità demo: parco eolico virtuale davanti all'utente, ovunque si trovi.
// Nessun file, nessun GPS: turbine in coordinate relative (azimut/distanza) su terreno piano.
// Si apre con ?demo=1 oppure con il pulsante «Prova la demo» del pannello.
import { abbassamento, norm360, H_OCCHIO } from './geo.js?v=202611180844';

// Aerogeneratore tipo (mozzo 119 m, rotore 162 m, altezza massima 200 m)
const HUB = 119, D = 162;

// Layout: due file sfalsate, distanze 0,7–1,6 km, ±25° attorno alla direzione di vista
const LAYOUT = [
  { id: 'WTG01', az: -24, dist: 1250 },
  { id: 'WTG02', az: -12, dist: 800 },
  { id: 'WTG03', az: 0, dist: 1100 },
  { id: 'WTG04', az: 11, dist: 700 },
  { id: 'WTG05', az: 23, dist: 1050 },
  { id: 'WTG06', az: 6, dist: 1600 }
];

export const demoRichiesta = () => new URLSearchParams(location.search).get('demo') === '1';

// azCentro: azimut (°N) verso cui si guarda all'avvio; le turbine sono distribuite attorno
export function datiParcoDemo(azCentro = 0) {
  const turbine = LAYOUT.map(l => ({
    id: l.id, hub: HUB, D, h: HUB + D / 2,
    az: norm360(azCentro + l.az), dist: l.dist,
    dz: -abbassamento(l.dist) - H_OCCHIO,            // terreno piano alla stessa quota dell'osservatore
    hVis: HUB + D / 2
  }));
  return {
    punto: { id: 'DEMO', etichetta: 'Parco virtuale', demo: true, baricentro: { az: norm360(azCentro) } },
    turbine
  };
}

export const NOME_DEMO = 'Zefiro AR – demo';
