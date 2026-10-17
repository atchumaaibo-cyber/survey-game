// 画面にキャラクターをちりばめる（飾り。操作の邪魔をしない）
// 画像を差し替える・増やすときは img/ に置いて CHARS に足す。読み込めない画像は自動で出さない。
(function () {
  const CHARS = [
    { src: 'img/yuma.jpg', name: 'ユウマ' },
    { src: 'img/banauta.png', name: 'ばなうた君' },
  ];
  // スクリーンでの置き場所（画面の端だけ。left/top は %、size は vh）
  const SLOTS = {
    screen: [
      { l: 2, t: 12, s: 14 }, { l: 3, t: 44, s: 11 }, { l: 1, t: 74, s: 15 },
      { l: 90, t: 10, s: 12 }, { l: 92, t: 40, s: 14 }, { l: 12, t: 88, s: 9 },
      { l: 80, t: 2, s: 9 },
    ],
  };

  // スマホは画面が狭いので、上のバー（タイトルの横）に小さく並べる
  function placeInBar(bar) {
    const brand = bar.querySelector('.brand');
    CHARS.forEach((c, i) => {
      const img = new Image();
      img.alt = '';
      img.className = 'deco-mini';
      img.onerror = () => img.remove();
      img.src = c.src;
      img.style.cssText = `animation-delay:${i * 0.8}s;--r:${i % 2 ? 8 : -8}deg`;
      brand.after(img);
    });
  }

  function place(mode) {
    if (mode === 'phone') return placeInBar(document.querySelector('.bar'));
    const layer = document.createElement('div');
    layer.className = 'deco';
    layer.setAttribute('aria-hidden', 'true');
    SLOTS[mode].forEach((p, i) => {
      const c = CHARS[i % CHARS.length];
      const img = new Image();
      img.alt = '';
      img.onerror = () => img.remove();
      img.src = c.src;
      img.style.cssText = `left:${p.l}%;top:${p.t}%;width:${p.s}vh;height:${p.s}vh;animation-delay:${(i * 0.7) % 3}s;--r:${(i % 2 ? 1 : -1) * (6 + i % 3 * 3)}deg`;
      layer.appendChild(img);
    });
    document.body.prepend(layer);
  }

  const css = document.createElement('style');
  css.textContent = `
    .deco{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}
    .deco img{position:absolute;object-fit:cover;border-radius:50%;border:.35em solid #fff;box-shadow:0 .4em 1.2em rgba(0,0,0,.25);
      transform:rotate(var(--r));animation:decoBob 3.2s ease-in-out infinite}
    .deco-mini{width:30px;height:30px;object-fit:cover;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2);
      transform:rotate(var(--r));animation:decoBob 3.2s ease-in-out infinite}
    @keyframes decoBob{0%,100%{transform:rotate(var(--r)) translateY(0)}50%{transform:rotate(calc(var(--r) * -1)) translateY(-6%)}}`;
  document.head.appendChild(css);

  window.Deco = { place };
})();
