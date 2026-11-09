// Zefiro AR – collegamento al Google Drive tramite l'app web Apps Script del Mirino
// (mirino_drive/Codice.gs, stesso URL e stessa chiave). Il Mirino e Zefiro AR stanno
// sullo stesso sito (diegodebenedittis.github.io), quindi la configurazione salvata
// dal Mirino ('mirino_cloud') vale anche qui senza reinserirla.
//   - foto: azione 'carica_foto' → Mirino_foto/<progetto> + foglio Foto (categoria 'ar')
//   - progetti: 'elenco_progetti' / 'scarica_progetto' (Sopralluogo_dati.json del plugin)
// Le foto passano da una coda in IndexedDB: senza rete restano sul telefono e partono
// appena torna la connessione.

const CHIAVE = 'mirino_cloud';
let cloud = { url: '', chiave: '' };
try { cloud = Object.assign(cloud, JSON.parse(localStorage.getItem(CHIAVE) || '{}')); } catch { /* */ }

let progetto = '', inCorso = false, inCoda = 0, errore = '', avvisa = () => {};

export const configurato = () => !!cloud.url;
export const config = () => ({ ...cloud });
export function salvaConfig(url, chiave) {
  cloud = { url: url.trim(), chiave: chiave.trim() };
  try { localStorage.setItem(CHIAVE, JSON.stringify(cloud)); } catch { /* */ }
}
export function impostaProgetto(nome) { progetto = nome || ''; }
export function suStato(f) { avvisa = f; }
export function stato() {
  if (!cloud.url) return 'Drive non configurato';
  return inCoda ? `☁ ${inCoda} file da inviare${errore ? ' (' + errore + ')' : ''}` : '☁ Drive: tutto inviato';
}

async function invia(corpo) {
  const r = await fetch(cloud.url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ chiave: cloud.chiave, progetto }, corpo))
  });
  return r.json();
}

export async function prova() {
  const j = await invia({ azione: 'elenco_progetti' });
  if (!j.ok) throw new Error(j.errore || 'risposta non valida');
  return j.progetti || [];
}
export async function elencoProgetti() { return prova(); }
export async function scaricaProgetto(nome) {
  const j = await invia({ azione: 'scarica_progetto', nome });
  if (!j.ok || !j.dati) throw new Error(j.errore || 'progetto non trovato');
  return j.dati;
}

// ---- coda foto (IndexedDB)
function db() {
  return new Promise((ok, ko) => {
    const rq = indexedDB.open('zefiroar_drive', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('coda', { autoIncrement: true });
    rq.onsuccess = () => ok(rq.result); rq.onerror = () => ko(rq.error);
  });
}
async function op(modo, fn) {
  const d = await db();
  return new Promise(ok => {
    const tx = d.transaction('coda', modo), q = fn(tx.objectStore('coda'));
    tx.oncomplete = () => ok(q?.result); tx.onerror = () => ok(null);
  });
}
async function conta() { try { inCoda = (await op('readonly', s => s.count())) || 0; } catch { /* */ } avvisa(); }

const base64 = blob => new Promise(ok => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.readAsDataURL(blob);
});

// accoda un file (Blob) e prova subito l'invio
export async function accoda(blob, nome, info) {
  if (!cloud.url) return false;
  const dati = await base64(blob);
  await op('readwrite', s => s.add({
    nome, mime: blob.type, dati, progetto,
    punto: info.punto, lat: info.lat, lon: info.lon, ora: new Date().toISOString(), id: info.id
  }));
  await conta();
  inviaCoda();
  return true;
}

export async function inviaCoda() {
  if (!cloud.url || inCorso || !navigator.onLine) return;
  inCorso = true;
  try {
    const chiavi = (await op('readonly', s => s.getAllKeys())) || [];
    for (const k of chiavi) {
      const v = await op('readonly', s => s.get(k));
      if (!v) continue;
      const pPrec = progetto; progetto = v.progetto || pPrec;
      const j = await invia({ azione: 'carica_foto', id_rilievo: v.id, punto: v.punto, categoria: 'ar',
        nome: v.nome, mime: v.mime, dati: v.dati, lat: v.lat, lon: v.lon, ora: v.ora });
      progetto = pPrec;
      if (j.ok) { await op('readwrite', s => s.delete(k)); errore = ''; }
      else { errore = j.errore === 'chiave' ? 'chiave non valida' : (j.errore || 'errore'); break; }
    }
  } catch { errore = 'Drive non raggiungibile'; }
  inCorso = false;
  conta();
}

addEventListener('online', inviaCoda);
setInterval(inviaCoda, 60000);
conta();
