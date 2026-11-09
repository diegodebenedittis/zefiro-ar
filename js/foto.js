// Zefiro AR – scatto dall'app: fotogramma della fotocamera + scena 3D (turbine, etichette)
// composti in un JPEG a piena risoluzione dello schermo, con una didascalia in basso.
// Va chiamato subito dopo renderer.render() nello stesso fotogramma (il buffer WebGL
// non è conservato).

function nomeFile(punto) {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const pid = String(punto ?? 'AR').replace(/[^\w.-]+/g, '_');
  return `ZefiroAR_${pid}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.jpg`;
}

export function componi(video, tela3d, didascalia) {
  const W = tela3d.width, H = tela3d.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const vw = video?.videoWidth, vh = video?.videoHeight;
  if (vw && vh && !video.hidden) {                       // stesso ritaglio "cover" dello schermo
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  g.drawImage(tela3d, 0, 0, W, H);
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

export function salva(canvas, punto) {
  return new Promise(ok => canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile(punto);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    ok(a.download);
  }, 'image/jpeg', 0.92));
}
