/*
 * Firebase Realtime Database 版の状態管理
 * - サーバーなし。全クライアントが /{ROOM} を購読し、同じ view（public / me / admin）を組み立てる
 * - 集計は「回答締切」を押した管理画面が計算して results に書く
 */
window.Store = (function () {
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const Q = { practice: window.QUESTIONS.practice, main: window.QUESTIONS.questions };
  const ROOM = window.ROOM || 'game';
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = cfg.apiKey && !/PASTE_/.test(cfg.apiKey) && !/PASTE_/.test(cfg.databaseURL || '');

  let db = null, auth = null, uid = null;
  let data = {};

  function init() {
    if (!configured) throw new Error('js/firebase-config.js に Firebase の設定を貼り付けてください');
    firebase.initializeApp(cfg);
    db = firebase.database();
    auth = firebase.auth();
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      auth.onAuthStateChanged(u => {
        if (u) { uid = u.uid; resolve(uid); }
        else auth.signInAnonymously().catch(reject);
      });
    });
  }

  // ---------------- 状態アクセサ（サーバー版と同じ意味）
  const st = () => Object.assign({ stage: 'practice', phase: 'idle', qIndex: -1, finalReveal: 0 }, data.state || {});
  const players = () => data.players || {};
  const answers = () => data.answers || {};
  const results = () => data.results || {};
  const isPractice = () => st().stage === 'practice';
  const qKey = () => isPractice() ? 'p' : String(st().qIndex);
  function currentQuestion() {
    const s = st();
    if (s.stage === 'practice') return Q.practice;
    if (s.qIndex >= 0 && s.qIndex < Q.main.length) return Q.main[s.qIndex];
    return null;
  }
  const eligible = p => isPractice() ? true : !!p.entered;

  function computeResult() {
    const q = currentQuestion();
    if (!q) return null;
    const ans = answers()[qKey()] || {};
    const n = q.options.length;
    const counts = new Array(n).fill(0), guessCounts = new Array(n).fill(0);
    let total = 0;
    for (const [pid, a] of Object.entries(ans)) {
      const p = players()[pid];
      if (!p || !eligible(p)) continue;
      if (a.own < 0 || a.own >= n || a.guess < 0 || a.guess >= n) continue;
      counts[a.own]++; guessCounts[a.guess]++; total++;
    }
    const chosen = counts.map((c, i) => (c > 0 ? i : -1)).filter(i => i >= 0);
    let majority = [], minority = [];
    if (chosen.length) {
      const max = Math.max(...chosen.map(i => counts[i]));
      const min = Math.min(...chosen.map(i => counts[i]));
      majority = chosen.filter(i => counts[i] === max);
      if (chosen.length > 1 && min < max) minority = chosen.filter(i => counts[i] === min);
    }
    return { counts, guessCounts, total, majority, minority };
  }

  // 本番問題の得点（results と自分の回答から計算）
  function pointsOf(pid, key) {
    const r = results()[key];
    const a = (answers()[key] || {})[pid];
    if (!r || !a) return null;
    return {
      own: a.own, guess: a.guess,
      minorityPt: (r.minority || []).includes(a.own) ? 1 : 0,
      majorityPt: (r.majority || []).includes(a.guess) ? 1 : 0,
    };
  }
  function totalsOf(pid) {
    let mi = 0, ma = 0;
    for (const k of Object.keys(results())) {
      if (k === 'p') continue;
      const pp = pointsOf(pid, k);
      if (pp) { mi += pp.minorityPt; ma += pp.majorityPt; }
    }
    return { minority: mi, majority: ma, total: mi + ma };
  }
  function ranking() {
    const rows = Object.entries(players())
      .filter(([, p]) => p.entered)
      .map(([id, p]) => ({ id, name: p.name, joinedAt: p.joinedAt || 0, ...totalsOf(id) }));
    rows.sort((a, b) => b.total - a.total || a.joinedAt - b.joinedAt);
    let rank = 0, prev = null;
    rows.forEach((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
    return rows;
  }
  function topGroups() {
    const groups = [];
    for (const r of ranking()) {
      if (r.rank > 3) break;
      let g = groups.find(x => x.rank === r.rank);
      if (!g) { g = { rank: r.rank, total: r.total, players: [] }; groups.push(g); }
      g.players.push({ name: r.name, minority: r.minority, majority: r.majority });
    }
    return groups;
  }

  // ---------------- ビュー
  function publicView() {
    const s = st(), q = currentQuestion();
    const pl = Object.entries(players()).map(([id, p]) => ({ id, ...p }));
    const elig = pl.filter(eligible);
    const ans = answers()[qKey()] || {};
    const v = {
      stage: s.stage, phase: s.phase, qIndex: s.qIndex, totalQuestions: Q.main.length,
      question: q ? { text: q.text, options: q.options } : null,
      counts: { players: pl.length, entered: pl.filter(p => p.entered).length, eligible: elig.length, answered: elig.filter(p => ans[p.id]).length },
      result: null, ranking: null, finalReveal: s.finalReveal || 0,
    };
    if (s.phase === 'result') {
      const r = results()[qKey()];
      if (r) v.result = { counts: r.counts || [], guessCounts: r.guessCounts || [], total: r.total || 0, majority: r.majority || [], minority: r.minority || [] };
    }
    if (s.phase === 'final') v.ranking = topGroups();
    return v;
  }
  function meView() {
    const p = players()[uid];
    if (!p) return null;
    const s = st(), key = qKey();
    const a = (answers()[key] || {})[uid] || null;
    return {
      id: uid, name: p.name, entered: !!p.entered, eligible: eligible(p),
      answer: a ? { own: a.own, guess: a.guess } : null,
      result: s.phase === 'result' ? pointsOf(uid, key) : null,
      totals: totalsOf(uid),
    };
  }
  function adminView() {
    const s = st(), ans = answers()[qKey()] || {};
    const pl = Object.entries(players()).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
      .map(([id, p]) => ({ id, name: p.name, entered: !!p.entered, eligible: eligible(p), answered: !!ans[id], ...totalsOf(id) }));
    return {
      players: pl,
      questions: Q.main.map((q, i) => ({ index: i, text: q.text })),
      practice: { text: Q.practice.text },
      ranking: ranking().slice(0, 10),
      adminKeySet: !!(data.config && data.config.adminKey),
      lastQuestionDone: s.stage === 'main' && s.qIndex >= Q.main.length - 1 && s.phase === 'result',
    };
  }

  function subscribe(role, onView, onError) {
    db.ref(ROOM).on('value', snap => {
      data = snap.val() || {};
      const v = { public: publicView() };
      if (role === 'player') v.me = meView();
      if (role === 'admin') v.admin = adminView();
      onView(v);
    }, err => onError && onError(err));
    // 接続状態
    db.ref('.info/connected').on('value', s => onError && onError(s.val() ? null : new Error('offline')));
  }

  // ---------------- 参加者操作
  const ref = p => db.ref(ROOM + '/' + p);
  const P = {
    async join(name) {
      name = String(name || '').trim().slice(0, 20);
      if (!name) throw new Error('名前を入力してください');
      const cur = players()[uid];
      if (cur) await ref('players/' + uid + '/name').set(name);
      else await ref('players/' + uid).set({ name, joinedAt: firebase.database.ServerValue.TIMESTAMP, entered: false });
    },
    async answer(own, guess) {
      const p = players()[uid];
      if (!p) throw new Error('参加情報が見つかりません。もう一度参加してください');
      if (st().phase !== 'open') throw new Error('回答は締め切られました');
      if (!eligible(p)) throw new Error('本番に参加登録してから回答してください');
      await ref('answers/' + qKey() + '/' + uid).set({ own, guess, at: firebase.database.ServerValue.TIMESTAMP });
    },
    async enter() {
      if (!players()[uid]) throw new Error('参加情報が見つかりません。もう一度参加してください');
      await ref('players/' + uid + '/entered').set(true);
    },
  };

  // ---------------- 管理操作
  function checkKey(key) {
    const k = data.config && data.config.adminKey;
    return !!k && String(key) === String(k);
  }
  const A = {
    async setAdminKey(key) {
      if (data.config && data.config.adminKey) throw new Error('管理キーは設定済みです');
      key = String(key || '').trim();
      if (key.length < 4) throw new Error('4文字以上にしてください');
      await ref('config/adminKey').set(key);
    },
    async run(action, body = {}) {
      const s = st();
      const setState = patch => ref('state').update(patch);
      const needQ = () => { if (!currentQuestion()) throw new Error('表示中の問題がありません'); };
      switch (action) {
        case 'start_practice': return setState({ stage: 'practice', qIndex: -1, phase: 'open', finalReveal: 0 });
        case 'open': needQ(); return setState({ phase: 'open' });
        case 'close': {
          needQ();
          if (s.phase !== 'open') throw new Error('回答受付中ではありません');
          const r = computeResult();
          await ref('results/' + qKey()).set(r);
          return setState({ phase: 'closed' });
        }
        case 'reveal': {
          needQ();
          if (!['closed', 'result'].includes(s.phase)) throw new Error('先に回答を締め切ってください');
          if (!results()[qKey()]) await ref('results/' + qKey()).set(computeResult());
          return setState({ phase: 'result' });
        }
        case 'reopen': needQ(); await ref('results/' + qKey()).remove(); return setState({ phase: 'open' });
        case 'to_main': return setState({ stage: 'main', qIndex: -1, phase: 'idle', finalReveal: 0 });
        case 'next': {
          const nextIdx = s.stage === 'practice' ? 0 : s.qIndex + 1;
          if (nextIdx >= Q.main.length) throw new Error('最後の問題です');
          return setState({ stage: 'main', qIndex: nextIdx, phase: 'idle' });
        }
        case 'goto': {
          const idx = Number(body.qIndex);
          if (!Number.isInteger(idx) || idx < -1 || idx >= Q.main.length) throw new Error('問題番号が不正です');
          return setState({ stage: 'main', qIndex: idx, phase: 'idle', finalReveal: 0 });
        }
        case 'final': return setState({ stage: 'main', phase: 'final', finalReveal: 0 });
        case 'final_next':
          if (s.phase !== 'final') throw new Error('最終ランキング表示中ではありません');
          return setState({ finalReveal: Math.min((s.finalReveal || 0) + 1, topGroups().length) });
        case 'final_back': return setState({ finalReveal: Math.max((s.finalReveal || 0) - 1, 0) });
        case 'kick': {
          const upd = {};
          upd['players/' + body.pid] = null;
          for (const k of Object.keys(answers())) upd['answers/' + k + '/' + body.pid] = null;
          return ref('/').update(upd);
        }
        case 'reset': {
          const key = data.config && data.config.adminKey;
          return ref('/').set({ config: key ? { adminKey: key } : null, state: { stage: 'practice', phase: 'idle', qIndex: -1, finalReveal: 0 } });
        }
        default: throw new Error('unknown action: ' + action);
      }
    },
  };

  return { init, signIn, subscribe, configured, checkKey, player: P, admin: A, esc, LABELS, get uid() { return uid; }, get questions() { return Q; } };
})();
