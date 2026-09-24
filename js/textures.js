/* =====================================================================
   رسم النصوص والملصقات على Canvas لتحويلها إلى صور داخل المشهد ثلاثي الأبعاد
   ===================================================================== */
import * as THREE from 'three';

const FONT = 'Cairo, sans-serif';

/* تقسيم نص مثل  Mg^{2+} + 2Cl^{−} → MgCl_{2}  إلى أجزاء (عادي/علوي/سفلي) */
function parseChem(str) {
  const out = []; const re = /(\^\{[^}]*\}|_\{[^}]*\})/g; let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ t: str.slice(last, m.index), mode: 'n' });
    out.push({ t: m[0].slice(2, -1), mode: m[0][0] === '^' ? 'sup' : 'sub' });
    last = re.lastIndex;
  }
  if (last < str.length) out.push({ t: str.slice(last), mode: 'n' });
  return out;
}

export function measureChem(ctx, str, size, weight = 900) {
  let w = 0;
  for (const s of parseChem(str)) {
    ctx.font = `${weight} ${s.mode === 'n' ? size : size * 0.62}px ${FONT}`;
    w += ctx.measureText(s.t).width + (s.mode === 'n' ? 0 : size * 0.04);
  }
  return w;
}

/* رسم نص كيميائي من اليسار إلى اليمين. colorFn تسمح بتلوين الشحنات */
export function drawChem(ctx, str, x, y, size, color, { align = 'center', weight = 900, supColor } = {}) {
  const w = measureChem(ctx, str, size, weight);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save(); ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const s of parseChem(str)) {
    const small = s.mode !== 'n';
    ctx.font = `${weight} ${small ? size * 0.62 : size}px ${FONT}`;
    ctx.fillStyle = s.mode === 'sup' && supColor ? supColor : color;
    const dy = s.mode === 'sup' ? -size * 0.4 : s.mode === 'sub' ? size * 0.2 : 0;
    ctx.fillText(s.t, cx + (small ? size * 0.02 : 0), y + dy);
    cx += ctx.measureText(s.t).width + (small ? size * 0.04 : 0);
  }
  ctx.restore();
  return w;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/* ملصق الأيون (الرمز + الشحنة) */
export function ionLabelTexture(label, sign) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const size = 120; ctx.font = `900 ${size}px ${FONT}`;
  const w = Math.ceil(measureChem(ctx, label, size) + 90), h = 170;
  c.width = w; c.height = h;
  const border = sign > 0 ? '#f97316' : '#3b82f6';
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  roundRect(ctx, 8, 8, w - 16, h - 22, 60); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.lineWidth = 10; ctx.strokeStyle = border; ctx.stroke();
  drawChem(ctx, label, w / 2, 122, size, '#0f172a', { supColor: sign > 0 ? '#ea580c' : '#2563eb' });
  return { texture: toTexture(c), aspect: w / h };
}

/* لافتة عامة: أسطر عربية أو كيميائية، مع إطار ملوّن */
export function bannerCanvas(lines, { border = '#22d3ee', bg = 'rgba(255,255,255,0.96)', width = 1400, pad = 40 } = {}) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const gap = 18; let H = pad * 2;
  for (const l of lines) H += l.size * 1.3 + gap;
  H -= gap; c.width = width; c.height = Math.ceil(H);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  roundRect(ctx, 14, 14, width - 28, c.height - 32, 56); ctx.fillStyle = bg; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.lineWidth = 12; ctx.strokeStyle = border; ctx.stroke();
  let y = pad; const maxW = width - pad * 2 - 20;
  for (const l0 of lines) {
    // تصغير الخط تلقائيًا إذا كان السطر أطول من اللافتة
    const l = { ...l0 }; let w;
    if (l.segments) w = l.segments.reduce((a, s) => a + measureChem(ctx, s.t, l.size), 0);
    else if (l.chem) w = measureChem(ctx, l.text, l.size);
    else { ctx.font = `${l.weight || 900} ${l.size}px ${FONT}`; w = ctx.measureText(l.text).width; }
    if (w > maxW) l.size = Math.floor(l.size * maxW / w);
    const base = y + l0.size * 1.02 - (l0.size - l.size) * 0.5;
    if (l.segments) { // مقاطع ملوّنة من اليسار لليمين (المعادلات)
      let total = 0; for (const s of l.segments) total += measureChem(ctx, s.t, l.size);
      let x = width / 2 - total / 2;
      for (const s of l.segments) { x += drawChem(ctx, s.t, x, base, l.size, s.c || '#0f172a', { align: 'left' }); }
    } else if (l.chem) {
      drawChem(ctx, l.text, width / 2, base, l.size, l.color || '#0f172a');
    } else {
      ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'center';
      ctx.font = `${l.weight || 900} ${l.size}px ${FONT}`; ctx.fillStyle = l.color || '#0f172a';
      ctx.fillText(l.text, width / 2, base); ctx.restore();
    }
    y += l0.size * 1.3 + gap;
  }
  return c;
}

export function bannerTexture(lines, opts) {
  const c = bannerCanvas(lines, opts);
  return { texture: toTexture(c), aspect: c.width / c.height, canvas: c };
}

/* تحديث نسيج موجود بلافتة جديدة (للكتابة التدريجية) */
export function redrawBanner(entry, lines, opts) {
  const c = bannerCanvas(lines, opts);
  entry.texture.image = c; entry.texture.needsUpdate = true;
  entry.aspect = c.width / c.height;
  return entry;
}

/* توهج دائري ناعم */
let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

export { toTexture };
