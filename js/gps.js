// Zefiro AR – posizione del telefono (GNSS del dispositivo, alta precisione)
export function creaGps(suAggiorna) {
  let id = null, fix = null, errore = null;
  return {
    avvia() {
      if (id != null) return;
      if (!navigator.geolocation) { errore = 'posizione non disponibile in questo browser'; suAggiorna?.(); return; }
      id = navigator.geolocation.watchPosition(
        p => {
          fix = { lon: p.coords.longitude, lat: p.coords.latitude, acc: p.coords.accuracy, t: Date.now() };
          errore = null; suAggiorna?.();
        },
        e => { errore = e.code === 1 ? 'permesso alla posizione negato' : 'posizione non ricevuta (' + e.message + ')'; suAggiorna?.(); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    },
    ferma() { if (id != null) navigator.geolocation.clearWatch(id); id = null; },
    get fix() { return fix; },
    get errore() { return errore; }
  };
}
