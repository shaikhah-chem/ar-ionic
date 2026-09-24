/* =====================================================================
   بناء مشهد البطاقة ثلاثي الأبعاد وتحريكه عبر "خط زمني"
   كل ما يظهر فوق البطاقة يُحسب من الزمن t (يتوقف عند اختفاء البطاقة)
   ===================================================================== */
import * as THREE from 'three';
import { ionLabelTexture, bannerTexture, glowTexture } from './textures.js?v=4';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function spriteFrom({ texture, aspect }, height, order = 20) {
  const m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(height * aspect, height, 1); s.renderOrder = order;
  s.userData.h = height; s.userData.aspect = aspect;
  return s;
}
function setSpriteTexture(s, { texture, aspect }) {
  s.material.map?.dispose(); s.material.map = texture; s.material.needsUpdate = true;
  s.userData.aspect = aspect;
}
function glowSprite(color, size, opacity = 0.6) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

export class CardScene {
  constructor(card, parent) {
    this.card = card;
    this.root = new THREE.Group();
    this.root.position.y = (card.stageY ?? 0.1) - 0.1; // محاذاة المنصة مع منطقة الرسم في البطاقة
    parent.add(this.root);

    // الخط الزمني: حساب بداية كل مرحلة
    let t0 = 0;
    this.stages = card.stages.map((s) => { const o = { ...s, start: t0 }; t0 += s.dur; return o; });
    this.total = t0;
    this.stageOf = (type) => this.stages.find((s) => s.type === type);

    this.appear = 0;       // زمن ظهور الأيونات أول مرة
    this.feedback = null;  // تغذية راجعة للسؤال داخل المشهد
    this.fbTime = 0;
    this.celebrateT = -1;
    this._lastBalance = -1;
    this.build();
  }

  /* ------------------------------ البناء ------------------------------ */
  build() {
    const c = this.card;
    this.ionsBox = new THREE.Group(); this.root.add(this.ionsBox);

    // ظل ناعم على سطح البطاقة
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.scale.set(0.95, 0.4, 1); sh.position.set(0, 0.1, 0.002); this.root.add(sh); this.shadow = sh;

    // منصة داكنة شبه شفافة أسفل الأيونات (تُبرز المجسمات وتخفي الرسم المطبوع)
    const pc = document.createElement('canvas'); pc.width = 1024; pc.height = 512; const px = pc.getContext('2d');
    const grd = px.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, 'rgba(15,23,42,0.88)'); grd.addColorStop(1, 'rgba(30,41,59,0.8)');
    px.fillStyle = grd; px.beginPath(); px.roundRect(12, 12, 1000, 488, 90); px.fill();
    px.lineWidth = 14; px.strokeStyle = c.accent; px.stroke();
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    this.stage = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: ptex, transparent: true, opacity: 0, depthWrite: false }));
    this.stage.position.set(0, 0.1, 0.004); this.root.add(this.stage);

    this.ions = c.ions.map((ion, i) => {
      const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
      const atoms = ion.atoms || [{ color: ion.color, r: ion.r, off: [0, 0, 0] }];
      for (const a of atoms) {
        const mat = new THREE.MeshPhysicalMaterial({
          color: a.color, roughness: 0.28, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2,
          emissive: new THREE.Color(a.color), emissiveIntensity: 0.18,
        });
        const m = new THREE.Mesh(new THREE.SphereGeometry(a.r, 48, 32), mat);
        m.position.set(...a.off); body.add(m);
        if (ion.atoms) { // حرف العنصر على كل ذرة داخل المجموعة
          const lt = ionLabelTexture(a.el, 0); const s = spriteFrom(lt, a.r * 0.75, 15);
          s.material.opacity = 0.95; s.position.set(a.off[0], a.off[1], a.off[2] + a.r + 0.01); body.add(s);
        }
      }
      if (ion.atoms) { // رابطة O–H
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.abs(atoms[1].off[0]), 16),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }));
        b.rotation.z = Math.PI / 2; b.position.x = atoms[1].off[0] / 2; body.add(b);
      }
      const glow = glowSprite(ion.sign > 0 ? '#ffb347' : '#60a5fa', ion.r * 4.2, 0.45); glow.renderOrder = 1; body.add(glow);

      const labelTex = ionLabelTexture(ion.label, ion.sign);
      const label = spriteFrom(labelTex, 0.062, 30);
      const cx = ion.atoms ? atoms[1].off[0] / 2 : 0;
      label.position.set(cx, ion.r + 0.055, ion.r * 0.6); g.add(label);

      let ring = null;
      if (ion.group) { // إطار "القوسين" حول المجموعة متعددة الذرات
        ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.008, 12, 80),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 }));
        ring.scale.set(Math.abs(atoms[1].off[0]) / 2 + ion.r + 0.035, ion.r + 0.035, 1); ring.position.set(cx, 0, 0); ring.renderOrder = 5;
        g.add(ring);
      }
      g.position.copy(V(ion.start)); g.scale.setScalar(0.0001);
      this.ionsBox.add(g);
      return { def: ion, g, body, glow, label, ring, start: V(ion.start), end: V(ion.end), cx };
    });

    // خطوط وجسيمات التجاذب
    this.bonds = c.bonds.map(([a, b]) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      tube.renderOrder = 3; this.ionsBox.add(tube);
      const parts = [];
      for (let k = 0; k < 10; k++) {
        const fromCation = k % 2 === 0;
        const s = glowSprite(fromCation ? '#ffd166' : this.ions[b].def.color, 0.035, 0);
        s.renderOrder = 4; this.ionsBox.add(s); parts.push({ s, fromCation, off: k / 10 });
      }
      return { a, b, tube, parts };
    });

    // هالة التكوّن + حلقة
    this.halo = glowSprite(c.accent, 0.75, 0); this.halo.position.set(0, 0.1, 0.06); this.halo.renderOrder = 0; this.root.add(this.halo);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.006, 12, 120),
      new THREE.MeshBasicMaterial({ color: c.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.position.set(0, 0.1, 0.02); this.root.add(this.ring);

    // اللافتات
    this.topBanner = spriteFrom(this.balanceTex(0), 0.22, 40); this.topBanner.position.set(0, 0.4, 0.1);
    this.root.add(this.topBanner);
    const br = this.stageOf('brackets');
    if (br) {
      this.brBanner = spriteFrom(bannerTexture([
        { text: br.title, size: 84, color: '#b45309' },
        { text: br.lines[0], size: 60, weight: 700 },
        { text: br.lines[1], size: 60, weight: 700 },
        { chem: true, text: br.compare, size: 74 },
      ], { border: '#f59e0b', width: 1200 }), 0.3, 41);
      this.brBanner.position.set(0, 0.43, 0.1); this.root.add(this.brBanner);
    }
    const fs = this.stageOf('formula');
    this.formulaBanner = spriteFrom(bannerTexture([
      { chem: true, text: c.formula, size: 190, color: '#0f172a' },
      { chem: true, text: fs.equation, size: 78, color: '#334155' },
    ], { border: c.accent, width: 1300 }), 0.21, 42);
    this.formulaBanner.position.set(0, -0.14, 0.1); this.root.add(this.formulaBanner);
    this.nameBanner = spriteFrom(bannerTexture([{ text: c.nameAr, size: 110, color: '#ffffff' }],
      { border: '#ffffff', bg: 'rgba(15,23,42,0.92)', width: 1200 }), 0.095, 43);
    this.nameBanner.position.set(0, -0.33, 0.1); this.root.add(this.nameBanner);

    this.fbBanner = spriteFrom(bannerTexture([{ text: ' ', size: 60 }]), 0.2, 50);
    this.fbBanner.position.set(0, 0.4, 0.12); this.root.add(this.fbBanner);

    // جسيمات الاحتفال
    this.sparks = [];
    for (let i = 0; i < 40; i++) {
      const s = glowSprite(['#fde047', '#4ade80', '#22d3ee', '#f472b6', '#ffffff'][i % 5], 0.04, 0);
      s.renderOrder = 60; this.root.add(s);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2;
      this.sparks.push({ s, v: new THREE.Vector3(Math.cos(a) * e * 0.5, Math.sin(a) * e * 0.5, Math.random() * 0.4 + 0.1) });
    }
    for (const b of [this.topBanner, this.brBanner, this.formulaBanner, this.nameBanner, this.fbBanner]) if (b) b.material.opacity = 0;
  }

  /* لافتة "وازن الشحنات" تُكتب حدًّا حدًّا */
  balanceTex(shown) {
    const st = this.stageOf('balance'); const n = st.terms.length;
    const segs = [];
    st.terms.forEach((term, i) => {
      const vis = i < shown;
      if (i > 0) segs.push({ t: '  +  ', c: vis ? '#475569' : 'rgba(0,0,0,0)' });
      segs.push({ t: term.t, c: vis ? term.c : 'rgba(0,0,0,0)' });
    });
    const done = shown > n;
    segs.push({ t: '  =  ' + st.result, c: done ? '#0f172a' : 'rgba(0,0,0,0)' });
    const lines = [{ text: st.title, size: 96, color: '#0e7490' }, { segments: segs, size: 104 }];
    if (st.subline) lines.push({ chem: true, text: st.subline, size: 80, color: done ? '#334155' : 'rgba(0,0,0,0)' });
    lines.push({ chem: true, text: st.note, size: 66, color: done ? '#64748b' : 'rgba(0,0,0,0)' });
    return bannerTexture(lines, { border: this.card.accent });
  }

  /* تغذية راجعة للسؤال داخل المشهد */
  showFeedback(ok, detail) {
    const lines = ok
      ? [{ text: 'إجابة صحيحة ✓', size: 100, color: '#15803d' }, { chem: true, text: this.card.quiz.successEquation, size: 84 }]
      : [{ text: 'حاولي مرة أخرى', size: 90, color: '#b91c1c' }, ...(detail ? [/[؀-ۿ]/.test(detail) ? { text: detail.replace(/[\^_]\{([^}]*)\}/g, '$1'), size: 58, weight: 700 } : { chem: true, text: detail, size: 84, color: '#b91c1c' }] : [])];
    setSpriteTexture(this.fbBanner, bannerTexture(lines, { border: ok ? '#22c55e' : '#ef4444' }));
    this.fbBanner.userData.h = ok ? 0.2 : 0.18;
    this.feedback = ok ? 'ok' : 'bad'; this.fbTime = 0;
    if (ok) this.celebrateT = 0;
  }

  reset() {
    this.feedback = null; this.celebrateT = -1; this._lastBalance = -1;
    setSpriteTexture(this.topBanner, this.balanceTex(0));
  }

  /* الزمن الحالي → رقم المرحلة الحالية */
  stageIndexAt(t) {
    let idx = -1; this.stages.forEach((s, i) => { if (t >= s.start) idx = i; }); return idx;
  }
  prog(type, t) { const s = this.stageOf(type); return s ? clamp((t - s.start) / s.dur) : 0; }

  /* ------------------------------ التحديث كل إطار ------------------------------ */
  update(t, dt, time, visible) {
    if (visible) this.appear += dt;
    const pA = this.prog('attract', t), pB = this.prog('balance', t), pK = this.prog('brackets', t);
    const pF = this.prog('formula', t), pN = this.prog('name', t);
    const move = easeInOut(clamp(pA / 0.85));
    const formed = easeInOut(pF);

    // الأيونات
    this.ions.forEach((o, i) => {
      const a = clamp((this.appear - i * 0.18) / 0.8);
      o.g.scale.setScalar(Math.max(0.0001, easeOutBack(a)));
      o.g.position.lerpVectors(o.start, o.end, move);
      // اهتزاز خفيف (يطفو) + ارتجاف تجاذب
      o.g.position.z += Math.sin(time * 1.6 + i) * 0.008 * (1 - formed * 0.6);
      if (pA > 0 && pA < 1) o.g.position.x += Math.sin(time * 30 + i) * 0.002 * (1 - pA);
      // نبض الشحنات أثناء التجاذب
      const pulse = pA > 0 && pF < 1 ? 1 + 0.18 * Math.max(0, Math.sin(time * 5 + i)) * (1 - formed) : 1;
      o.label.scale.set(o.label.userData.h * o.label.userData.aspect * pulse, o.label.userData.h * pulse, 1);
      o.glow.material.opacity = 0.35 + 0.35 * (pA > 0 ? Math.abs(Math.sin(time * 3 + i)) * (1 - formed * 0.5) : 0);
      if (o.ring) { // إبراز الأقواس
        const k = pK > 0 ? (pK < 1 ? 0.55 + 0.45 * Math.sin(time * 6) : 0.8) : 0;
        o.ring.material.opacity = k * (1 - pN * 0.4);
      }
    });

    // التجاذب: أنبوب متوهج + جسيمات تتجه نحو المنتصف
    const bondOn = pA > 0 ? (1 - clamp(pF * 1.3)) : 0;
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), dir = new THREE.Vector3();
    for (const b of this.bonds) {
      const A = this.ions[b.a], B = this.ions[b.b];
      tmpA.copy(A.g.position); tmpB.copy(B.g.position);
      const n = dir.subVectors(tmpB, tmpA).normalize();
      const pA_ = tmpA.clone().addScaledVector(n, A.def.r * 0.9), pB_ = tmpB.clone().addScaledVector(n, -B.def.r * 0.9);
      const seg = pB_.clone().sub(pA_); const sl = Math.max(0.001, seg.length());
      b.tube.position.copy(pA_).addScaledVector(seg, 0.5);
      b.tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.clone().normalize());
      b.tube.scale.set(0.006 + 0.004 * Math.sin(time * 8), sl, 0.006 + 0.004 * Math.sin(time * 8));
      b.tube.material.opacity = bondOn * (0.35 + 0.25 * Math.sin(time * 6));
      for (const p of b.parts) {
        const u = (time * 0.9 + p.off) % 1; // 0 → 1 نحو المنتصف
        const f = p.fromCation ? u * 0.5 : 1 - u * 0.5;
        p.s.position.copy(pA_).addScaledVector(seg, f);
        p.s.material.opacity = bondOn * Math.sin(u * Math.PI) * 0.95;
        p.s.scale.setScalar(0.03 + 0.02 * Math.sin(u * Math.PI));
      }
    }

    // دوران خفيف بعد التكوّن لإظهار البعد الثالث
    this.ionsBox.rotation.y = Math.sin(time * 0.7) * 0.35 * formed;
    this.ionsBox.position.z = 0.015 * formed;
    this.halo.material.opacity = 0.55 * formed * (0.8 + 0.2 * Math.sin(time * 2));
    this.halo.scale.setScalar(0.75 + 0.07 * Math.sin(time * 2));
    this.ring.material.opacity = 0.9 * formed; this.ring.rotation.z = time * 0.5;
    this.ring.scale.setScalar(0.6 + 0.4 * easeOutBack(pF));
    this.shadow.material.opacity = 0.3 * clamp(this.appear / 0.8);
    this.stage.material.opacity = clamp(this.appear / 0.6);

    // لافتة الموازنة: تظهر الحدود واحدًا واحدًا
    const st = this.stageOf('balance'); const nT = st.terms.length;
    const shown = pB <= 0 ? 0 : Math.min(nT + 1, Math.floor(pB * (nT + 2.2)) + 1);
    if (shown !== this._lastBalance) { setSpriteTexture(this.topBanner, this.balanceTex(shown)); this._lastBalance = shown; }
    const hideTop = pK > 0 ? clamp(pK * 4) : 0;
    this.popSprite(this.topBanner, pB > 0 ? clamp(pB * 5) : 0, 1 - hideTop);
    if (this.brBanner) this.popSprite(this.brBanner, pK > 0 ? clamp(pK * 4) : 0, 1);
    this.popSprite(this.formulaBanner, clamp(pF * 2.5), 1);
    this.popSprite(this.nameBanner, clamp(pN * 3), 1);

    // التغذية الراجعة للسؤال
    if (this.feedback) {
      this.fbTime += dt;
      const k = this.feedback === 'bad' ? (this.fbTime < 3.5 ? 1 : clamp(1 - (this.fbTime - 3.5) * 2)) : 1;
      this.popSprite(this.fbBanner, clamp(this.fbTime * 3), k);
      if (k <= 0) this.feedback = null;
      const cover = k; // إخفاء اللافتة العلوية خلف التغذية الراجعة
      this.topBanner.material.opacity *= 1 - cover; if (this.brBanner) this.brBanner.material.opacity *= 1 - cover;
    } else this.fbBanner.material.opacity = 0;

    // احتفال بالإجابة الصحيحة
    if (this.celebrateT >= 0) {
      this.celebrateT += dt; const ct = this.celebrateT;
      for (const s of this.sparks) {
        s.s.position.set(0, 0.1, 0.08).addScaledVector(s.v, Math.min(ct, 1.6));
        s.s.position.z -= 0.1 * ct * ct;
        s.s.material.opacity = clamp(1 - ct / 1.8);
      }
      if (ct > 2) this.celebrateT = -1;
    }
  }

  popSprite(s, p, fade) {
    const k = p <= 0 ? 0 : easeOutBack(p);
    s.material.opacity = clamp(p * 1.5) * fade;
    const h = s.userData.h * Math.max(0.0001, k);
    s.scale.set(h * s.userData.aspect, h, 1);
  }
}
