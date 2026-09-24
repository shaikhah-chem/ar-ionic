/* يحفظ ملفات التجربة في الجوال بعد أول فتح، لتعمل في الفصل حتى دون إنترنت.
   الاستراتيجية: الشبكة أولًا (للحصول على آخر تحديث) ثم النسخة المحفوظة عند انقطاع الإنترنت.
   عند تعديل الملفات لاحقًا غيّري رقم الإصدار أدناه، وكذلك ?v= في index.html */
const CACHE = 'ar-ionic-v5';
const FILES = [
  './', 'index.html', 'print.html', 'guide.html', 'lib/style.min.css', 'lib/app.min.js',
  'vendor/three/three.module.min.js', 'vendor/three/addons/renderers/CSS3DRenderer.js',
  'vendor/mindar/mindar-image-three.prod.js', 'vendor/mindar/controller-mGt1s8dJ.js', 'vendor/mindar/ui-fBadYuor.js',
  'targets/targets.mind', 'vendor/qrcode.mjs',
  'fonts/cairo-arabic-400-normal.woff2', 'fonts/cairo-arabic-700-normal.woff2', 'fonts/cairo-arabic-900-normal.woff2',
  'fonts/cairo-latin-400-normal.woff2', 'fonts/cairo-latin-700-normal.woff2', 'fonts/cairo-latin-900-normal.woff2',
  'cards/card-mgcl2.png', 'cards/card-al2o3.png', 'cards/card-caoh2.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => { // يتحقق دائمًا من وجود نسخة أحدث على الموقع
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
