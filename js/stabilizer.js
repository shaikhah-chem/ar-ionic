/* =====================================================================
   مُثبِّت الحركة: يقلل ارتجاف المجسمات فوق البطاقة
   الفكرة: نتبع موضع البطاقة بنعومة — الحركات الصغيرة جدًا (ارتجاف)
   تُهمَل تقريبًا، والحركات الكبيرة (تحريك الجوال فعلًا) تُتبَع بسرعة.
   ===================================================================== */
import * as THREE from 'three';

// كلما زاد STRENGTH زاد الثبات (مع تأخر بسيط في المتابعة). المدى المقترح 1 – 3
export const STRENGTH = 3;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Stabilizer {
  constructor(anchorGroup, scene) {
    this.src = anchorGroup;               // يحدّثه MindAR مباشرة (مرتجف)
    this.holder = new THREE.Group();      // نضع فيه المشهد (ناعم)
    this.holder.visible = false;
    scene.add(this.holder);
    this.tp = new THREE.Vector3(); this.tq = new THREE.Quaternion(); this.ts = new THREE.Vector3();
    this.fresh = true;
  }

  update(dt) {
    const h = this.holder;
    if (!this.src.visible) { h.visible = false; this.fresh = true; return; }
    this.src.matrix.decompose(this.tp, this.tq, this.ts);
    if (this.fresh) { // أول ظهور: انتقال مباشر بلا تنعيم
      h.position.copy(this.tp); h.quaternion.copy(this.tq); h.scale.copy(this.ts);
      this.fresh = false; h.visible = true; return;
    }
    h.visible = true;
    const size = this.ts.x || 1;                                  // عرض البطاقة بوحدات المشهد
    const dPos = h.position.distanceTo(this.tp) / size;           // الإزاحة بالنسبة لعرض البطاقة
    const dAng = h.quaternion.angleTo(this.tq);                   // فرق الدوران (راديان)
    // 0 = ارتجاف صغير ، 1 = حركة حقيقية كبيرة
    const motion = clamp(Math.max((dPos - 0.008) / 0.07, (dAng - 0.012) / 0.14), 0, 1);
    const rate = (4 + 40 * motion * motion) / STRENGTH;          // سرعة اللحاق بالبطاقة
    const a = 1 - Math.exp(-rate * dt);
    h.position.lerp(this.tp, a);
    h.quaternion.slerp(this.tq, a);
    h.scale.lerp(this.ts, a);
  }
}
