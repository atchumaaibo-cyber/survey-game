// 画面にキャラクターをちりばめる（飾り。操作の邪魔をしない）
// 画像を差し替える・増やすときは img/ に置いて CHARS に足す。読み込めないものは自動で出さない。
//   kind: 'photo' = 白フチの写真（ポラロイド風） / 'cutout' = 背景透過のイラスト
//   video を書くと、動く写真（音なしループ）になる
(function () {
  const CHARS = [
    { kind: 'cutout', src: 'img/banauta.png' },
    { kind: 'photo', src: 'img/yuma.jpg' },
    { kind: 'photo', src: 'img/yuma1.jpg' },
    { kind: 'cutout', src: 'img/banauta.png' },
    { kind: 'photo', src: 'img/yuma_tongue.jpg' },
    { kind: 'photo', src: 'img/yuma3.jpg' },
    { kind: 'photo', src: 'img/yuma4.jpg' },
  ];
  // スクリーンでの置き場所（画面の端だけ。left/top は %、size は vh、r は傾き）
  const SLOTS = [
    { l: 1.5, t: 9, s: 19, r: -7 }, { l: 2, t: 40, s: 14, r: 5 }, { l: 1, t: 68, s: 15, r: -4 },
    { l: 89, t: 8, s: 14, r: 6 }, { l: 90.5, t: 36, s: 19, r: -5 }, { l: 13, t: 84, s: 12, r: 8 },
    { l: 76, t: 1.5, s: 11, r: -8 },
  ];

  function make(c, sizeCss, rot, delay) {
    const wrap = document.createElement('div');
    wrap.className = 'deco-item ' + c.kind;
    wrap.style.cssText = `width:${sizeCss};--s:${sizeCss};--r:${rot}deg;animation-delay:${delay}s`;
    const img = new Image();
    img.alt = '';
    img.onerror = () => wrap.remove();
    img.src = c.src;
    wrap.appendChild(img);
    if (c.video) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, src: c.video });
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.oncanplay = () => { img.replaceWith(v); v.play().catch(() => {}); };
      v.onerror = () => {};
    }
    return wrap;
  }

  // スマホは画面が狭いので、上のバー（タイトルの横）に小さく並べる
  function placeInBar(bar) {
    const brand = bar.querySelector('.brand');
    const box = document.createElement('span');
    box.className = 'deco-bar';
    box.setAttribute('aria-hidden', 'true');
    [CHARS[0], CHARS[1]].forEach((c, i) => box.appendChild(make(c, c.kind === 'cutout' ? '34px' : '30px', i ? 6 : -6, i * 0.8)));
    brand.after(box);
  }

  function place(mode) {
    if (mode === 'phone') return placeInBar(document.querySelector('.bar'));
    const layer = document.createElement('div');
    layer.className = 'deco';
    layer.setAttribute('aria-hidden', 'true');
    SLOTS.forEach((p, i) => {
      const el = make(CHARS[i % CHARS.length], p.s + 'vh', p.r, (i * 0.7) % 3);
      el.style.left = p.l + '%'; el.style.top = p.t + '%';
      layer.appendChild(el);
    });
    document.body.prepend(layer);
  }

  const css = document.createElement('style');
  css.textContent = `
    .deco{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}
    .deco .deco-item{position:absolute}
    .deco-item{transform:rotate(var(--r));animation:decoBob 4s ease-in-out infinite}
    .deco-item img,.deco-item video{display:block;width:100%}
    .deco-item.photo{background:#fff;padding:calc(var(--s) * .06) calc(var(--s) * .06) calc(var(--s) * .16);border-radius:4px;box-shadow:0 .6em 1.6em rgba(0,0,0,.28)}
    .deco-item.photo img,.deco-item.photo video{aspect-ratio:1;object-fit:cover;border-radius:2px}
    .deco-item.cutout img{filter:drop-shadow(0 .5em .8em rgba(0,0,0,.25))}
    .deco-bar{display:inline-flex;align-items:center;gap:6px}
    .deco-bar .deco-item.photo{border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.18)}
    @keyframes decoBob{0%,100%{transform:rotate(var(--r)) translateY(0)}50%{transform:rotate(calc(var(--r) * .4)) translateY(-5%)}}
    @media (prefers-reduced-motion: reduce){.deco-item{animation:none}}`;
  document.head.appendChild(css);

  window.Deco = { place };
})();
