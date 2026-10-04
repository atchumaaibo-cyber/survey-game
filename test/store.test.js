'use strict';
/*
 * store.js の結合テスト（Firebase をインメモリでモック。ネット接続不要）
 * 使い方: node test/store.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------- Firebase compat API のごく一部を模したモック
class MockDB {
  constructor() { this.tree = {}; this.listeners = []; }
  static segs(p) { return String(p).split('/').filter(Boolean); }
  get(p) {
    let n = this.tree;
    for (const s of MockDB.segs(p)) { if (n == null || typeof n !== 'object') return null; n = n[s]; }
    return n === undefined ? null : JSON.parse(JSON.stringify(n));
  }
  setAt(p, val) {
    val = this.resolve(val);
    const segs = MockDB.segs(p);
    if (!segs.length) { this.tree = val == null ? {} : val; }
    else {
      let n = this.tree;
      for (const s of segs.slice(0, -1)) { if (n[s] == null || typeof n[s] !== 'object') n[s] = {}; n = n[s]; }
      if (val == null) delete n[segs[segs.length - 1]]; else n[segs[segs.length - 1]] = val;
    }
    this.notify();
  }
  resolve(v) {
    if (v && typeof v === 'object') {
      if (v['.sv'] === 'timestamp') return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const [k, x] of Object.entries(v)) { const r = this.resolve(x); if (r != null) o[k] = r; }
      return o;
    }
    return v;
  }
  notify() { for (const l of this.listeners) l.cb({ val: () => this.get(l.path) }); }
  ref(p) {
    const db = this;
    return {
      set: async v => db.setAt(p, v),
      update: async obj => { for (const [k, v] of Object.entries(obj)) db.setAt(p + '/' + k, v); },
      remove: async () => db.setAt(p, null),
      on: (ev, cb) => {
        if (p === '.info/connected') return cb({ val: () => true });
        db.listeners.push({ path: p, cb }); cb({ val: () => db.get(p) });
      },
    };
  }
}

function makeFirebase(db, uid) {
  return {
    initializeApp() {},
    database: Object.assign(() => ({ ref: p => db.ref(p) }), { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } }),
    auth: () => ({ onAuthStateChanged: cb => cb({ uid }), signInAnonymously: async () => {} }),
  };
}

// 別の uid を持つクライアントを1つ作る（store.js を独立したコンテキストで実行）
const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const questionsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'questions.js'), 'utf8');
function makeClient(db, uid, role) {
  const ctx = { firebase: makeFirebase(db, uid), FIREBASE_CONFIG: { apiKey: 'x', databaseURL: 'https://x' }, ROOM: 'game', console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(questionsSrc, ctx);
  vm.runInContext(storeSrc, ctx);
  const S = ctx.Store;
  const c = { uid, S, view: null };
  S.init();
  return S.signIn().then(() => { S.subscribe(role, v => { c.view = v; }); return c; });
}

(async () => {
  const db = new MockDB();
  const admin = await makeClient(db, 'admin-uid', 'admin');
  const screen = await makeClient(db, 'screen-uid', 'screen');
  const names = ['あっち', 'ゆうぞう', 'なんしー', 'たろう', 'はなこ', 'けん'];
  const P = [];
  for (let i = 0; i < names.length; i++) P.push(await makeClient(db, 'p' + i, 'player'));
  for (let i = 0; i < names.length; i++) await P[i].S.player.join(names[i]);
  assert.strictEqual(screen.view.public.counts.players, 6);
  assert.strictEqual(P[0].view.me.name, 'あっち');

  // 管理キー
  assert.strictEqual(admin.view.admin.adminKeySet, false);
  await admin.S.admin.setAdminKey('banauta');
  assert.strictEqual(admin.view.admin.adminKeySet, true);
  assert.ok(admin.S.checkKey('banauta') && !admin.S.checkKey('xxx'));
  await assert.rejects(admin.S.admin.setAdminKey('other'));
  const A = (a, b) => admin.S.admin.run(a, b);

  // 受付前は回答不可
  await assert.rejects(P[0].S.player.answer(0, 0), /締め切られ/);

  // ---------- 練習: 春3 夏2 秋1 冬0
  await A('start_practice');
  assert.strictEqual(screen.view.public.phase, 'open');
  const own = [0, 0, 0, 1, 1, 2];
  for (let i = 0; i < 6; i++) await P[i].S.player.answer(own[i], 0);
  assert.strictEqual(screen.view.public.counts.answered, 6);
  await A('close');
  await assert.rejects(P[0].S.player.answer(0, 0));
  await A('reveal');
  const r = screen.view.public.result;
  assert.deepStrictEqual(r.counts, [3, 2, 1, 0]);
  assert.deepStrictEqual(r.majority, [0]);
  assert.deepStrictEqual(r.minority, [2]);
  assert.strictEqual(P[5].view.me.result.minorityPt, 1);
  assert.strictEqual(P[5].view.me.result.majorityPt, 1);
  assert.strictEqual(P[5].view.me.totals.total, 0);   // 練習は加算しない
  console.log('practice OK');

  // ---------- 本番参加（けん は不参加）
  await A('to_main');
  assert.strictEqual(P[0].view.public.qIndex, -1);
  for (let i = 0; i < 5; i++) await P[i].S.player.enter();
  assert.strictEqual(screen.view.public.counts.entered, 5);

  // ---------- 第1問: A3 B1 C1 D0
  await A('next'); assert.strictEqual(screen.view.public.qIndex, 0); assert.strictEqual(screen.view.public.phase, 'idle');
  await A('open');
  const own1 = [0, 0, 0, 1, 2], guess1 = [0, 0, 0, 0, 1];
  for (let i = 0; i < 5; i++) await P[i].S.player.answer(own1[i], guess1[i]);
  await assert.rejects(P[5].S.player.answer(0, 0), /本番に参加/);
  await P[4].S.player.answer(2, 1); // 回答変更
  await A('close'); await A('reveal');
  assert.deepStrictEqual(screen.view.public.result.counts, [3, 1, 1, 0]);
  assert.deepStrictEqual(screen.view.public.result.minority, [1, 2]);
  assert.deepStrictEqual(screen.view.public.result.majority, [0]);
  assert.strictEqual(P[3].view.me.totals.total, 2);
  assert.strictEqual(P[4].view.me.totals.total, 1);
  assert.strictEqual(P[5].view.me.entered, false);
  console.log('Q1 OK');

  // ---------- 第2問: A2 B2 C1（多数派同率）
  await A('next'); await A('open');
  const own2 = [0, 0, 1, 1, 2], guess2 = [0, 1, 2, 0, 3];
  for (let i = 0; i < 5; i++) await P[i].S.player.answer(own2[i], guess2[i]);
  await A('close'); await A('reveal');
  assert.deepStrictEqual(screen.view.public.result.majority, [0, 1]);
  assert.deepStrictEqual(screen.view.public.result.minority, [2]);
  assert.strictEqual(P[1].view.me.result.majorityPt, 1);
  console.log('Q2 OK');

  // ---------- 第3問: 全員同じ → 少数派なし。締切取消も確認
  await A('next'); await A('open');
  for (let i = 0; i < 5; i++) await P[i].S.player.answer(3, 3);
  await A('close'); await A('reveal');
  assert.deepStrictEqual(screen.view.public.result.minority, []);
  await A('reopen');
  assert.strictEqual(screen.view.public.phase, 'open'); assert.strictEqual(screen.view.public.result, null);
  await A('close'); await A('reveal');
  console.log('Q3 OK');

  // ---------- 最終
  await A('final');
  const groups = screen.view.public.ranking;
  console.log('ranking groups:', JSON.stringify(groups));
  assert.ok(groups.length >= 1 && groups[0].rank === 1 && groups.every(g => g.rank <= 3));
  for (let i = 0; i < 6; i++) await A('final_next');
  assert.strictEqual(screen.view.public.finalReveal, groups.length);
  await A('final_back');
  assert.strictEqual(screen.view.public.finalReveal, groups.length - 1);
  assert.strictEqual(admin.view.admin.ranking[0].rank, 1);
  assert.strictEqual(admin.view.admin.players.length, 6);

  // ---------- kick / reset
  await A('kick', { pid: 'p5' });
  assert.strictEqual(admin.view.admin.players.length, 5);
  await A('reset');
  assert.strictEqual(admin.view.admin.players.length, 0);
  assert.strictEqual(admin.view.admin.adminKeySet, true);   // キーは残る
  assert.strictEqual(screen.view.public.stage, 'practice');
  assert.strictEqual(P[0].view.me, null);                   // 参加画面に戻る
  console.log('ALL TESTS PASSED');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
