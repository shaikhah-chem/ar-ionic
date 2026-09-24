/* =====================================================================
   التطبيق الرئيسي: تشغيل الكاميرا + التعرف على البطاقات + إدارة المراحل
   التقنية: MindAR (تتبع الصور) + Three.js — مجانية ومفتوحة المصدر
   ===================================================================== */
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-image-three.prod.js';
import { CARDS, chemHTML } from './cards.js?v=4';
import { CardScene } from './scene.js?v=4';
import { Stabilizer } from './stabilizer.js?v=4';

const $ = (id) => document.getElementById(id);
const ui = {
  intro: $('intro'), loading: $('loading'), error: $('error'), errorText: $('errorText'), hud: $('hud'),
  chip: $('cardChip'), dots: $('dots'), scan: $('scan'), panel: $('panel'), caption: $('caption'),
  actions: $('mainActions'), go: $('goBtn'), quiz: $('quiz'), qText: $('qText'), qOptions: $('qOptions'),
  qResult: $('qResult'), step: $('stepBtn'), reset: $('resetBtn'), toast: $('toast'),
};

let mind, scenes = [], stabs = [], states = [], active = -1, stepMode = false, everFound = false;
const visible = CARDS.map(() => false);

const newState = () => ({ t: 0, playing: false, waiting: false, holdAt: Infinity, quiz: false, solved: false, stageIdx: -2 });

/* ------------------------------ التشغيل ------------------------------ */
ui.go.addEventListener('click', onGo);
ui.step.addEventListener('click', () => {
  stepMode = !stepMode; ui.step.classList.toggle('active', stepMode);
  toast(stepMode ? 'وضع الشرح: تتوقف التجربة بعد كل مرحلة' : 'وضع التشغيل التلقائي');
  const st = states[active];
  if (st && st.playing && !stepMode) { st.waiting = false; st.holdAt = Infinity; refreshPanel(); }
  if (st && st.playing && stepMode) st.holdAt = nextBoundary(active, st.t);
});
ui.reset.addEventListener('click', () => { if (active >= 0) resetCard(active); });
// زر طي اللوحة السفلية لرؤية المشهد كاملًا
$('collapseBtn').addEventListener('click', () => {
  const m = ui.panel.classList.toggle('min');
  $('collapseBtn').textContent = m ? '▴ إظهار اللوحة' : '▾';
});

$('startBtn').addEventListener('click', start);

/* على شاشة الحاسب/جهاز العرض: رمز QR لرابط التجربة حتى تفتحه الطالبات بجوالاتهن */
if (window.matchMedia('(min-width: 800px)').matches) {
  import('../vendor/qrcode.mjs').then(({ default: qrcode }) => {
    const q = qrcode(0, 'M'); q.addData(location.origin + location.pathname.replace(/index\.html$/, '')); q.make();
    $('qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    show($('qrBox'));
  }).catch(() => {});
}

async function start() {
  if (!window.isSecureContext) {
    return fail('يجب فتح التجربة من رابط يبدأ بـ https:// حتى يسمح المتصفح باستخدام الكاميرا.');
  }
  show(ui.loading); hide(ui.intro);
  try {
    // تحميل الخط قبل رسم النصوص داخل المشهد
    await Promise.all(['900', '700'].flatMap((w) => [document.fonts.load(`${w} 40px Cairo`, 'كلوريد'), document.fonts.load(`${w} 40px Cairo`, 'MgCl')]));

    mind = new MindARThree({
      container: $('ar'),
      imageTargetSrc: 'targets/targets.mind',
      maxTrack: 1,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: 0.0001, filterBeta: 10,     // تنعيم أولي من MindAR (والتنعيم الأساسي في stabilizer.js)
      warmupTolerance: 3, missTolerance: 10,
    });
    const { renderer, scene, camera } = mind;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(0.5, 1, 2); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x88ccff, 1.0); rim.position.set(-1, -0.5, 1); scene.add(rim);

    CARDS.forEach((card, i) => {
      const anchor = mind.addAnchor(i);
      stabs[i] = new Stabilizer(anchor.group, scene);       // تنعيم حركة البطاقة
      scenes[i] = new CardScene(card, stabs[i].holder);
      states[i] = newState();
      anchor.onTargetFound = () => onFound(i);
      anchor.onTargetLost = () => onLost(i);
    });

    await mind.start();
    hide(ui.loading); show(ui.hud); ui.panel.classList.add('away');
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1), time = clock.elapsedTime;
      stabs.forEach((s) => s.update(dt));
      scenes.forEach((sc, i) => { advance(i, dt); sc.update(states[i].t, dt, time, visible[i]); });
      renderer.render(scene, camera);
    });
    window.__ar = { mind, scenes, states, visible, CARDS }; // للاختبار
  } catch (e) {
    console.error(e);
    fail('لم نتمكن من الوصول إلى الكاميرا. تأكدي من الضغط على «سماح» عند طلب الإذن، وأن الرابط يبدأ بـ https، ثم أعيدي المحاولة. (يُفضَّل متصفح Chrome على أندرويد أو Safari على آيفون)');
  }
}

function fail(msg) { hide(ui.loading); hide(ui.intro); ui.errorText.textContent = msg; show(ui.error); }

/* ------------------------------ التعرف على البطاقة ------------------------------ */
function onFound(i) {
  visible[i] = true;
  const changed = active !== i; active = i;
  ui.scan.classList.add('off');
  ui.panel.classList.remove('away');
  if (!everFound) { everFound = true; if (navigator.vibrate) navigator.vibrate(40); }
  if (changed) {
    const c = CARDS[i];
    document.documentElement.style.setProperty('--accent', c.accent);
    ui.chip.innerHTML = `بطاقة ${c.number} · ${chemHTML(c.formula)}`;
    toast(`تم التعرف على بطاقة ${c.nameAr} ✓`);
    buildDots(); states[i].stageIdx = -2; renderQuiz(); refreshPanel();
  }
}
function onLost(i) {
  visible[i] = false;
  if (i === active) ui.scan.classList.remove('off');
}

/* ------------------------------ الخط الزمني ------------------------------ */
function nextBoundary(i, t) {
  const sc = scenes[i];
  for (const s of sc.stages) if (s.start > t + 1e-3) return s.start;
  return t < sc.total - 1e-3 ? sc.total : Infinity; // وقفة قبل السؤال
}

function advance(i, dt) {
  const st = states[i], sc = scenes[i];
  if (!st.playing || !visible[i] || st.waiting) return;
  st.t += dt;
  if (stepMode && st.t >= st.holdAt) {
    st.t = st.holdAt; st.waiting = true; refreshPanel(); return;
  }
  if (st.t >= sc.total) { st.t = sc.total; st.playing = false; st.quiz = true; renderQuiz(); refreshPanel(); if (i === active) showQuiz(); return; }
  const idx = sc.stageIndexAt(st.t);
  if (idx !== st.stageIdx) { st.stageIdx = idx; if (i === active) refreshPanel(); }
}

function onGo() {
  const st = states[active]; if (!st) return;
  if (st.waiting) { // زر "التالي" في وضع الشرح
    st.waiting = false; st.holdAt = nextBoundary(active, st.t + 0.01); refreshPanel(); return;
  }
  if (!st.playing && !st.quiz) {
    st.playing = true; st.t = 0.001;
    st.holdAt = stepMode ? nextBoundary(active, st.t) : Infinity;
    refreshPanel();
  }
}

function resetCard(i) {
  states[i] = newState(); scenes[i].reset();
  renderQuiz(); refreshPanel(); toast('تمت إعادة التجربة');
}

/* ------------------------------ اللوحة السفلية ------------------------------ */
function buildDots() {
  const sc = scenes[active]; ui.dots.innerHTML = '';
  for (let k = 0; k <= sc.stages.length; k++) ui.dots.appendChild(document.createElement('i'));
}

function refreshPanel() {
  if (active < 0) return;
  const c = CARDS[active], st = states[active], sc = scenes[active];
  const idx = st.quiz ? sc.stages.length : st.playing || st.waiting ? sc.stageIndexAt(st.t - 0.01) : -1;
  [...ui.dots.children].forEach((d, k) => { d.className = k < idx ? 'done' : k === idx ? 'on' : ''; });

  if (st.quiz) { ui.caption.innerHTML = ''; ui.caption.classList.add('hidden'); hide(ui.actions); show(ui.quiz); return; }
  ui.caption.classList.remove('hidden'); hide(ui.quiz); show(ui.actions);

  if (!st.playing) {
    ui.caption.innerHTML = chemHTML(c.intro);
    ui.go.innerHTML = '⚡ ابدئي التجاذب'; ui.go.classList.add('pulse'); show(ui.go);
    return;
  }
  const stage = sc.stages[Math.max(0, idx)];
  let html = chemHTML(stage.caption);
  if (stage.type === 'balance') {
    const eq = stage.terms.map((x) => x.t).join(' + ') + ' = ' + stage.result;
    html += `<span class="math">${chemHTML(eq)}</span>`;
  }
  if (stage.type === 'formula') html += `<span class="math">${chemHTML(stage.equation)}</span>`;
  if (stage.type === 'name') html += `<span class="math">${chemHTML(c.formula)} · ${c.nameAr}</span>`;
  ui.caption.innerHTML = html;
  ui.go.classList.remove('pulse');
  if (st.waiting) {
    const nxt = sc.stages[idx + 1];
    const label = nxt ? { balance: 'وازني الشحنات', brackets: 'لماذا الأقواس؟', formula: 'كوّني المركب', name: 'اسم المركب' }[nxt.type] : 'سؤال التحقق';
    ui.go.innerHTML = `التالي: ${label} ←`; ui.go.classList.add('pulse'); show(ui.go);
  } else hide(ui.go);
}

/* ------------------------------ السؤال التفاعلي ------------------------------ */
function renderQuiz() {
  if (active < 0) return;
  const q = CARDS[active].quiz, st = states[active];
  ui.qText.innerHTML = chemHTML(q.question);
  ui.qOptions.innerHTML = '';
  q.options.forEach((o, k) => {
    const b = document.createElement('button'); b.className = 'opt' + (o.length > 6 ? ' small' : '');
    b.innerHTML = /[؀-ۿ]/.test(o) ? chemHTML(o) : `<bdi dir="ltr">${o}</bdi>`;
    b.addEventListener('click', () => answer(k, b));
    ui.qOptions.appendChild(b);
  });
  ui.qResult.className = 'q-result hidden'; ui.qResult.innerHTML = ''; ui.quiz.classList.remove('solved');
  if (st.solved) answer(q.correct, ui.qOptions.children[q.correct], true);
}
function showQuiz() { refreshPanel(); if (navigator.vibrate) navigator.vibrate(30); }

function answer(k, btn, silent = false) {
  const c = CARDS[active], q = c.quiz, sc = scenes[active];
  [...ui.qOptions.children].forEach((b) => b.classList.remove('wrong'));
  if (k === q.correct) {
    states[active].solved = true;
    btn.classList.add('right');
    [...ui.qOptions.children].forEach((b) => (b.disabled = true));
    ui.quiz.classList.add('solved'); // نخفي السؤال والخيارات لتظهر الأيونات كاملة
    ui.qResult.className = 'q-result ok';
    ui.qResult.innerHTML = `<div class="ok-row">
        <div class="ok-txt"><div class="big">${q.success} · ${c.nameAr}</div><span class="eq">${chemHTML(q.successEquation)}</span></div>
        <button class="again" id="againBtn" title="إعادة التجربة">↺</button>
      </div>`;
    $('againBtn').addEventListener('click', () => resetCard(active));
    if (!silent) { sc.showFeedback(true); if (navigator.vibrate) navigator.vibrate([30, 60, 30]); }
  } else {
    void btn.offsetWidth; btn.classList.add('wrong');
    const d = q.wrongDetail?.[k];
    ui.qResult.className = 'q-result bad';
    ui.qResult.innerHTML = `<div class="hint">💡 ${chemHTML(q.hint)}</div>${d ? `<span class="calc">${chemHTML(d)}</span>` : ''}`;
    sc.showFeedback(false, d);
  }
}

/* ------------------------------ أدوات ------------------------------ */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
let toastTimer;
function toast(msg) {
  ui.toast.textContent = msg; ui.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}
