// Zefiro AR – scatto dall'app: fotogramma della fotocamera + scena 3D (turbine, etichette)
// composti in un JPEG a piena risoluzione dello schermo, con una didascalia in basso.
// Va chiamato subito dopo renderer.render() nello stesso fotogramma (il buffer WebGL
// non è conservato). Con i livelli: anche foto pura (JPG), turbine e etichette (PNG trasparenti).

export function nomeBase(punto) {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const pid = String(punto ?? 'AR').replace(/[^\w.-]+/g, '_');
  return `ZefiroAR_${pid}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

export function componi(video, tela3d, didascalia, larg, alt) {
  const W = larg ?? tela3d.width, H = alt ?? tela3d.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const vw = video?.videoWidth, vh = video?.videoHeight;
  if (vw && vh && !video.hidden) {                       // stesso ritaglio "cover" dello schermo
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  if (tela3d.width) g.drawImage(tela3d, 0, 0, W, H);
  if (didascalia) {
    const fs = Math.round(H * 0.014), pad = Math.round(fs * 0.6);
    g.font = `600 ${fs}px system-ui, sans-serif`;
    const righe = didascalia.split('\n');
    const h = righe.length * fs * 1.3 + pad * 2;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H - h, W, h);
    g.fillStyle = '#fff'; g.textBaseline = 'top';
    righe.forEach((r, i) => g.fillText(r, pad, H - h + pad + i * fs * 1.3));
  }
  return c;
}

// copia del canvas WebGL (va fatta subito dopo il render)
export function copia(tela) {
  const c = document.createElement('canvas');
  c.width = tela.width; c.height = tela.height;
  c.getContext('2d').drawImage(tela, 0, 0);
  return c;
}

// salva un canvas: nome senza estensione; png = livello trasparente
export function salva(canvas, nome, png = false) {
  return new Promise(ok => canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome + (png ? '.png' : '.jpg');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    ok({ nome: a.download, blob });
  }, png ? 'image/png' : 'image/jpeg', 0.92));
}

// ruota l'immagine di -angolo (gradi, multipli di 90): telefono tenuto in orizzontale
export function ruota(c, angolo) {
  const a = ((angolo % 360) + 360) % 360;
  if (!a) return c;
  const r = document.createElement('canvas');
  const lat = a === 90 || a === 270;
  r.width = lat ? c.height : c.width; r.height = lat ? c.width : c.height;
  const g = r.getContext('2d');
  g.translate(r.width / 2, r.height / 2);
  g.rotate(-a * Math.PI / 180);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return r;
}

// didascalia in basso, su più righe se non entra in larghezza
export function didascalia(c, testo) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const fs = Math.max(14, Math.round(Math.min(W, H) * 0.022)), pad = Math.round(fs * 0.6);
  g.font = `600 ${fs}px system-ui, sans-serif`;
  const righe = [];
  for (const par of testo.split('\n')) {
    let riga = '';
    for (const p of par.split(' ')) {
      const prova = riga ? riga + ' ' + p : p;
      if (g.measureText(prova).width > W - 2 * pad && riga) { righe.push(riga); riga = p; } else riga = prova;
    }
    righe.push(riga);
  }
  const h = righe.length * fs * 1.3 + pad * 2;
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H - h, W, h);
  g.fillStyle = '#fff'; g.textBaseline = 'top';
  righe.forEach((r, i) => g.fillText(r, pad, H - h + pad + i * fs * 1.3));
  return c;
}
