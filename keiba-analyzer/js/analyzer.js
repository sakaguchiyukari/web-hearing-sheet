/**
 * Turf Lens - 分析ロジック
 * DOMに依存しない純粋な計算処理のみをまとめる（UIは app.js）
 *
 * 公開API: window.KeibaAnalyzer
 *  - loadResults(csvText)      過去成績CSVの読込・正規化
 *  - parseEntries(csvText)     出走表CSVの読込
 *  - summarize(rows)           データ概要
 *  - analyze(rows, dim, opt)   切り口別の集計
 *  - buildModel(rows)          予想モデル作成
 *  - predict(model, race, entries, weights)
 *  - backtest(rows, weights, evThreshold)
 *  - generateDemoCsv()         動作確認用の架空データ生成
 */
'use strict';

window.KeibaAnalyzer = (() => {
  /* =========================================================
     定数
     ========================================================= */

  /** CSVヘッダー → 内部キー の対応表（表記ゆれを吸収） */
  const HEADER_MAP = {
    'レースid': 'raceId', 'raceid': 'raceId',
    '日付': 'date', '開催日': 'date', 'date': 'date',
    '競馬場': 'course', '場名': 'course', 'course': 'course',
    'レース番号': 'raceNo', 'r': 'raceNo', 'raceno': 'raceNo',
    'レース名': 'raceName', 'racename': 'raceName',
    '距離': 'distance', 'distance': 'distance',
    '芝ダ': 'surface', '芝・ダ': 'surface', 'コース': 'surface', 'surface': 'surface',
    '馬場': 'going', '馬場状態': 'going', 'going': 'going',
    '枠番': 'frame', '枠': 'frame', 'frame': 'frame',
    '馬番': 'number', 'number': 'number',
    '馬名': 'horse', 'horse': 'horse',
    '騎手': 'jockey', 'jockey': 'jockey',
    '調教師': 'trainer', 'trainer': 'trainer',
    '人気': 'popularity', '単勝人気': 'popularity', 'popularity': 'popularity',
    '単勝オッズ': 'odds', '単勝': 'odds', 'オッズ': 'odds', 'odds': 'odds',
    '着順': 'rank', '着': 'rank', 'rank': 'rank',
  };

  /** 数値として扱う列 */
  const NUMERIC_KEYS = ['raceNo', 'distance', 'frame', 'number', 'popularity', 'odds', 'rank'];

  /** エラーメッセージ用の列名 */
  const KEY_LABELS = {
    date: '日付', course: '競馬場', distance: '距離', horse: '馬名', rank: '着順',
    raceKey: 'レースID / レース番号 / レース名 のいずれか',
  };

  const BAND_ORDER = ['短距離（〜1400m）', 'マイル（1401〜1800m）', '中距離（1801〜2200m）', '長距離（2201m〜）'];
  const GOING_ORDER = ['良', '稍重', '重', '不良'];

  /** 予想に使うファクター */
  const FACTORS = [
    { id: 'popularity', label: '人気' },
    { id: 'jockey', label: '騎手' },
    { id: 'trainer', label: '調教師' },
    { id: 'horse', label: '馬の通算成績' },
    { id: 'fit', label: '同条件の成績' },
    { id: 'frame', label: '枠順（同コース）' },
  ];

  /** 初期ウェイト（経験的な仮値。バックテストで調整する前提） */
  const DEFAULT_WEIGHTS = { popularity: 1, jockey: 0.4, trainer: 0.3, horse: 0.4, fit: 0.3, frame: 0.3 };

  /** ベイズ縮小の事前サンプル数（小標本の極端な勝率を平均へ寄せる強さ） */
  const PRIOR_STRENGTH = 20;

  /* =========================================================
     汎用ユーティリティ
     ========================================================= */

  /** 全角数字を半角にし、数値以外を除去して Number 化 */
  const toNumber = (raw) => {
    if (raw === undefined || raw === null) return null;
    const half = String(raw)
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[^\d.]/g, '');
    if (half === '') return null;
    const n = Number(half);
    return Number.isFinite(n) ? n : null;
  };

  /** 日付を YYYY-MM-DD に統一（並び替えのため） */
  const normalizeDate = (raw) => {
    const s = String(raw || '').trim();
    const m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return '';
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  };

  const normalizeSurface = (raw) => {
    const s = String(raw || '');
    if (s.includes('障')) return '障害';
    if (s.includes('芝')) return '芝';
    if (s.includes('ダ')) return 'ダート';
    return '';
  };

  const normalizeGoing = (raw) => {
    const s = String(raw || '');
    if (s.includes('稍')) return '稍重';
    if (s.includes('不')) return '不良';
    if (s.includes('重')) return '重';
    if (s.includes('良')) return '良';
    return '';
  };

  const distanceBand = (d) => {
    if (!d) return null;
    if (d <= 1400) return BAND_ORDER[0];
    if (d <= 1800) return BAND_ORDER[1];
    if (d <= 2200) return BAND_ORDER[2];
    return BAND_ORDER[3];
  };

  /* =========================================================
     CSV パース
     ========================================================= */

  /** RFC4180 準拠の簡易CSVパーサー（ダブルクォート・改行入りセル対応） */
  const parseCsv = (text) => {
    const src = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',' || c === '\t') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i += 1;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  };

  /** CSV → オブジェクト配列（ヘッダー名を内部キーへ変換） */
  const toRecords = (text) => {
    const table = parseCsv(text);
    if (table.length < 2) throw new Error('ヘッダー行とデータ行が必要です。');

    const keys = table[0].map((h) => {
      const key = h.trim().toLowerCase();
      return HEADER_MAP[key] || null;
    });

    const records = table.slice(1).map((cells) => {
      const rec = {};
      keys.forEach((k, i) => {
        if (!k) return;
        const raw = (cells[i] ?? '').trim();
        rec[k] = NUMERIC_KEYS.includes(k) ? toNumber(raw) : raw;
        if (k === 'distance') rec.distanceRaw = raw; // 「芝1600」形式に対応するため保持
      });
      return rec;
    });
    return { keys, records };
  };

  /** 人気が無い場合、同レース内の単勝オッズ順で補完 */
  const fillPopularity = (runners) => {
    const needs = runners.some((r) => !r.popularity);
    const allOdds = runners.every((r) => r.odds);
    if (!needs || !allOdds) return;
    [...runners].sort((a, b) => a.odds - b.odds).forEach((r, i) => { r.popularity = i + 1; });
  };

  /* =========================================================
     データ読込
     ========================================================= */

  const groupRaces = (rows) => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.raceId)) {
        map.set(r.raceId, {
          id: r.raceId, date: r.date, course: r.course, raceNo: r.raceNo,
          surface: r.surface, distance: r.distance, going: r.going, runners: [],
        });
      }
      map.get(r.raceId).runners.push(r);
    });
    return [...map.values()].sort((a, b) => (
      a.date === b.date ? String(a.id).localeCompare(String(b.id), 'ja', { numeric: true }) : a.date.localeCompare(b.date)
    ));
  };

  /** 過去成績CSVを読み込み、正規化した行配列を返す */
  const loadResults = (text) => {
    const { keys, records } = toRecords(text);

    const missing = ['date', 'course', 'distance', 'horse', 'rank'].filter((k) => !keys.includes(k));
    if (!['raceId', 'raceNo', 'raceName'].some((k) => keys.includes(k))) missing.push('raceKey');
    if (missing.length) {
      throw new Error(`必須列が見つかりません：${missing.map((k) => KEY_LABELS[k]).join('、')}`);
    }

    let skipped = 0;
    const rows = [];
    records.forEach((r) => {
      r.date = normalizeDate(r.date);
      r.surface = normalizeSurface(r.surface || r.distanceRaw);
      r.going = normalizeGoing(r.going);
      // 着順が数値でない行（取消・除外・中止など）は集計対象外
      if (!r.date || !r.horse || !Number.isInteger(r.rank) || r.rank < 1) { skipped += 1; return; }
      const raceKey = r.raceNo ? `${r.raceNo}R` : (r.raceName || '');
      r.raceId = r.raceId || `${r.date}_${r.course}_${raceKey}`;
      rows.push(r);
    });

    if (!rows.length) throw new Error('集計できる行がありません。着順列の内容を確認してください。');

    groupRaces(rows).forEach((race) => fillPopularity(race.runners));

    return {
      rows,
      skipped,
      hasOdds: rows.some((r) => r.odds),
      hasPopularity: rows.some((r) => r.popularity),
      usedRaceNameOnly: !keys.includes('raceId') && !keys.includes('raceNo'),
    };
  };

  /** 出走表CSV（予想対象）を読み込む */
  const parseEntries = (text) => {
    const { keys, records } = toRecords(text);
    if (!keys.includes('horse')) throw new Error('出走表に「馬名」列が必要です。');

    const entries = records.filter((r) => r.horse);
    if (entries.length < 2) throw new Error('出走馬は2頭以上入力してください。');

    const numbers = entries.map((e) => e.number).filter(Boolean);
    if (new Set(numbers).size !== numbers.length) throw new Error('馬番が重複しています。');

    fillPopularity(entries);
    return entries;
  };

  /* =========================================================
     集計
     ========================================================= */

  const emptyStat = () => ({ n: 0, win: 0, place: 0, nOdds: 0, payout: 0 });

  const addStat = (s, r) => {
    s.n += 1;
    if (r.rank === 1) s.win += 1;
    if (r.rank <= 3) s.place += 1;
    if (r.odds) {
      s.nOdds += 1;
      if (r.rank === 1) s.payout += r.odds * 100;
    }
  };

  const statOf = (rows) => rows.reduce((s, r) => { addStat(s, r); return s; }, emptyStat());

  const groupBy = (rows, keyFn) => {
    const map = new Map();
    rows.forEach((r) => {
      const k = keyFn(r);
      if (k === null || k === undefined || k === '') return;
      if (!map.has(k)) map.set(k, emptyStat());
      addStat(map.get(k), r);
    });
    return map;
  };

  /** 単勝回収率（全頭に100円ずつ賭けた場合） */
  const recoveryOf = (s) => (s.nOdds ? s.payout / (s.nOdds * 100) : null);

  const summarize = (rows) => {
    const dates = rows.map((r) => r.date).sort();
    const fav = statOf(rows.filter((r) => r.popularity === 1));
    return {
      races: new Set(rows.map((r) => r.raceId)).size,
      runners: rows.length,
      from: dates[0],
      to: dates[dates.length - 1],
      favWinRate: fav.n ? fav.win / fav.n : null,
      favRecovery: recoveryOf(fav),
      allRecovery: recoveryOf(statOf(rows)),
    };
  };

  /** 集計の切り口 */
  const DIMENSIONS = {
    popularity: { key: (r) => r.popularity, label: (k) => `${k}番人気`, sort: 'numeric' },
    frame: { key: (r) => r.frame, label: (k) => `${k}枠`, sort: 'numeric' },
    distance: { key: (r) => distanceBand(r.distance), label: (k) => k, sort: 'order', order: BAND_ORDER },
    going: { key: (r) => r.going, label: (k) => k, sort: 'order', order: GOING_ORDER },
    jockey: { key: (r) => r.jockey, label: (k) => k, sort: 'count', limit: 30 },
    trainer: { key: (r) => r.trainer, label: (k) => k, sort: 'count', limit: 30 },
  };

  const analyze = (rows, dimId, { course = '', surface = '', minN = 1 } = {}) => {
    const dim = DIMENSIONS[dimId];
    const target = rows.filter((r) => (!course || r.course === course) && (!surface || r.surface === surface));

    let list = [...groupBy(target, dim.key).entries()]
      .filter(([, s]) => s.n >= minN)
      .map(([k, s]) => ({
        key: k,
        label: dim.label(k),
        n: s.n,
        winRate: s.win / s.n,
        placeRate: s.place / s.n,
        recovery: recoveryOf(s),
      }));

    if (dim.sort === 'numeric') list.sort((a, b) => a.key - b.key);
    if (dim.sort === 'order') list.sort((a, b) => dim.order.indexOf(a.key) - dim.order.indexOf(b.key));
    if (dim.sort === 'count') list = list.sort((a, b) => b.n - a.n).slice(0, dim.limit);

    return { list, total: target.length };
  };

  /* =========================================================
     予想モデル
     ---------------------------------------------------------
     各ファクターの勝率を「全体勝率に向けてベイズ縮小」し、
     全体勝率との比の対数（= 上振れ度）を重み付きで合計。
     レース内でソフトマックス正規化して推定勝率とする。
     ========================================================= */

  const buildModel = (rows) => {
    const base = statOf(rows);
    const condKey = (r) => `${r.course}|${r.surface}|${distanceBand(r.distance)}`;
    return {
      p0: base.win / base.n,
      maps: {
        popularity: groupBy(rows, (r) => r.popularity),
        jockey: groupBy(rows, (r) => r.jockey),
        trainer: groupBy(rows, (r) => r.trainer),
        horse: groupBy(rows, (r) => r.horse),
        fit: groupBy(rows, (r) => `${r.horse}|${r.surface}|${distanceBand(r.distance)}`),
        frame: groupBy(rows, (r) => (r.frame ? `${condKey(r)}|${r.frame}` : null)),
        frameBase: groupBy(rows, condKey),
      },
      trainedRows: rows.length,
    };
  };

  /**
   * 縮小推定した勝率と、基準勝率に対する上振れ（対数の勝率比）
   * ※ロジット差（オッズ比）だとレース内正規化で本命が過大評価されるため、勝率比を使う
   */
  const liftOf = (stat, p0) => {
    if (!stat) return { lift: 0, n: 0, rate: null };
    const p = (stat.win + PRIOR_STRENGTH * p0) / (stat.n + PRIOR_STRENGTH);
    return { lift: Math.log(Math.max(p, 1e-4) / p0), n: stat.n, rate: stat.win / stat.n };
  };

  const MARKS = ['◎', '○', '▲', '△', '△'];

  const predict = (model, race, entries, weights = DEFAULT_WEIGHTS) => {
    const { maps, p0 } = model;
    const band = distanceBand(race.distance);
    const cond = `${race.course}|${race.surface}|${band}`;
    const frameBase = maps.frameBase.get(cond);
    const pFrame = frameBase && frameBase.n >= 50 ? frameBase.win / frameBase.n : p0;

    const scored = entries.map((entry) => {
      const factors = {
        popularity: liftOf(maps.popularity.get(entry.popularity), p0),
        jockey: liftOf(maps.jockey.get(entry.jockey), p0),
        trainer: liftOf(maps.trainer.get(entry.trainer), p0),
        horse: liftOf(maps.horse.get(entry.horse), p0),
        fit: liftOf(maps.fit.get(`${entry.horse}|${race.surface}|${band}`), p0),
        frame: liftOf(entry.frame ? maps.frame.get(`${cond}|${entry.frame}`) : null, pFrame),
      };
      const score = FACTORS.reduce((sum, f) => sum + (weights[f.id] ?? 0) * factors[f.id].lift, 0);
      return { entry, factors, score };
    });

    // ソフトマックス（オーバーフロー防止に最大値を引く）
    const max = Math.max(...scored.map((s) => s.score));
    const exps = scored.map((s) => Math.exp(s.score - max));
    const total = exps.reduce((a, b) => a + b, 0);

    return scored
      .map((s, i) => {
        const prob = exps[i] / total;
        return { ...s, prob, ev: s.entry.odds ? prob * s.entry.odds : null };
      })
      .sort((a, b) => b.prob - a.prob)
      .map((s, i) => ({ ...s, mark: MARKS[i] || '' }));
  };

  /* =========================================================
     バックテスト（時系列で前80%を学習、後20%で検証）
     ========================================================= */

  const backtest = (rows, weights = DEFAULT_WEIGHTS, evThreshold = 1.0) => {
    const races = groupRaces(rows);
    if (races.length < 30) throw new Error('検証には30レース以上のデータが必要です。');

    const split = Math.floor(races.length * 0.8);
    const trainRaces = races.slice(0, split);
    const testRaces = races.slice(split);
    const model = buildModel(trainRaces.flatMap((r) => r.runners));

    const newAcc = () => ({ bets: 0, hits: 0, place: 0, payout: 0, nOdds: 0, probSum: 0 });
    const record = (acc, e, prob = 0) => {
      acc.bets += 1;
      acc.probSum += prob;
      if (e.rank === 1) acc.hits += 1;
      if (e.rank <= 3) acc.place += 1;
      if (e.odds) {
        acc.nOdds += 1;
        if (e.rank === 1) acc.payout += e.odds * 100;
      }
    };
    const result = { model: newAcc(), fav: newAcc(), ev: newAcc() };

    testRaces.forEach((race) => {
      const preds = predict(model, race, race.runners, weights);
      record(result.model, preds[0].entry, preds[0].prob);

      const fav = race.runners.find((r) => r.popularity === 1);
      if (fav) record(result.fav, fav);

      preds.filter((p) => p.ev !== null && p.ev >= evThreshold).forEach((p) => record(result.ev, p.entry, p.prob));
    });

    const finalize = (acc) => ({
      bets: acc.bets,
      hitRate: acc.bets ? acc.hits / acc.bets : null,
      placeRate: acc.bets ? acc.place / acc.bets : null,
      recovery: acc.nOdds ? acc.payout / (acc.nOdds * 100) : null,
      avgProb: acc.bets && acc.probSum ? acc.probSum / acc.bets : null,
    });

    return {
      train: { races: trainRaces.length, from: trainRaces[0].date, to: trainRaces[trainRaces.length - 1].date },
      test: { races: testRaces.length, from: testRaces[0].date, to: testRaces[testRaces.length - 1].date },
      model: finalize(result.model),
      fav: finalize(result.fav),
      ev: finalize(result.ev),
    };
  };

  /* =========================================================
     デモ用 架空データ生成（実在のレース結果ではない）
     ========================================================= */

  const generateDemoCsv = ({ raceCount = 720, seed = 20240106 } = {}) => {
    // 再現性のある疑似乱数（mulberry32）
    let t = seed;
    const rand = () => {
      t = (t + 0x6D2B79F5) | 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const pad2 = (n) => String(n).padStart(2, '0');
    /** Fisher–Yates シャッフル（実行環境に依存せず同じ結果になる） */
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const courses = ['東京', '中山', '京都', '阪神', '中京', '新潟', '福島', '小倉', '札幌', '函館'];
    const distances = { 芝: [1200, 1400, 1600, 1800, 2000, 2200, 2400], ダート: [1200, 1400, 1600, 1700, 1800, 2100] };
    const goings = ['良', '良', '良', '良', '良', '良', '稍重', '稍重', '重', '不良'];
    const syllables = ['アル', 'ベル', 'カナ', 'ドリ', 'エス', 'フィ', 'グラ', 'ハル', 'イロ', 'ジュ', 'キタ', 'ルナ', 'ミラ', 'ノア', 'オリ', 'パル', 'クレ', 'リオ', 'セラ', 'トワ', 'ウィ', 'ヴェ', 'ソル', 'ゼン'];

    const jockeys = Array.from({ length: 24 }, (_, i) => ({ name: `騎手${pad2(i + 1)}`, skill: gauss() * 0.3 }));
    const trainers = Array.from({ length: 30 }, (_, i) => ({ name: `調教師${pad2(i + 1)}`, skill: gauss() * 0.2 }));
    const usedNames = new Set();
    const horses = Array.from({ length: 900 }, (_, i) => {
      let name = '';
      do {
        name = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => pick(syllables)).join('');
      } while (usedNames.has(name) && name.length < 12);
      if (usedNames.has(name)) name += i;
      usedNames.add(name);
      return {
        name,
        ability: gauss() * 0.7,
        turf: gauss() * 0.35,
        distPref: 1200 + rand() * 1400,
        trainer: pick(trainers),
      };
    });

    /** JRAの枠番割当（頭数が8を超える分は外枠から2頭枠になる） */
    const frameOf = (num, size) => {
      if (size <= 8) return num;
      const base = Math.floor(size / 8);
      const extra = size % 8;
      let count = 0;
      for (let f = 1; f <= 8; f += 1) {
        count += f > 8 - extra ? base + 1 : base;
        if (num <= count) return f;
      }
      return 8;
    };

    const header = 'レースID,日付,競馬場,レース番号,レース名,芝ダ,距離,馬場,枠番,馬番,馬名,騎手,調教師,人気,単勝オッズ,着順';
    const lines = [header];
    const date = new Date(Date.UTC(2023, 0, 7));

    for (let i = 0; i < raceCount; i += 1) {
      const raceNo = (i % 12) + 1;
      if (i > 0 && raceNo === 1) date.setUTCDate(date.getUTCDate() + (date.getUTCDay() === 6 ? 1 : 6));
      const dateStr = date.toISOString().slice(0, 10);
      const course = courses[Math.floor(i / 24) % courses.length];
      const surface = rand() < 0.55 ? '芝' : 'ダート';
      const distance = pick(distances[surface]);
      const going = pick(goings);
      const size = 10 + Math.floor(rand() * 7);

      // 出走馬・騎手を重複なく抽出
      const field = shuffle(horses).slice(0, size);
      const riders = shuffle(jockeys).slice(0, size);

      const runners = field.map((h, idx) => {
        const number = idx + 1;
        const frame = frameOf(number, size);
        const frameBias = surface === '芝' ? (frame <= 2 ? 0.08 : frame >= 7 ? -0.06 : 0) : 0;
        const strength = h.ability + riders[idx].skill + h.trainer.skill
          + (surface === '芝' ? h.turf : -h.turf)
          - Math.abs(distance - h.distPref) / 900 + frameBias;
        return { h, jockey: riders[idx], number, frame, strength };
      });

      // 市場（オッズ）：真の勝率をやや平準化（人気薄が過剰に買われる傾向を再現）し、
      // ノイズを加えて正規化。払戻率80%を想定
      const trueW = runners.map((r) => Math.exp(r.strength * 1.6));
      const est = trueW.map((w) => (w ** 0.92) * Math.exp(gauss() * 0.2));
      const estSum = est.reduce((a, b) => a + b, 0);
      runners.forEach((r, idx) => { r.odds = Math.max(1.1, Math.floor((0.8 / (est[idx] / estSum)) * 10) / 10); });
      [...runners].sort((a, b) => a.odds - b.odds).forEach((r, idx) => { r.popularity = idx + 1; });

      // 着順は実力 + ガンベルノイズ（Plackett-Luce相当）
      [...runners]
        .map((r) => ({ r, perf: r.strength * 1.6 - Math.log(-Math.log(rand() || 1e-9)) }))
        .sort((a, b) => b.perf - a.perf)
        .forEach((o, idx) => { o.r.rank = idx + 1; });

      runners.forEach((r) => {
        lines.push([
          `${dateStr.replace(/-/g, '')}${pad2(courses.indexOf(course) + 1)}${pad2(raceNo)}`,
          dateStr, course, raceNo, `${raceNo}R サンプル戦`, surface, distance, going,
          r.frame, r.number, r.h.name, r.jockey.name, r.h.trainer.name, r.popularity, r.odds.toFixed(1), r.rank,
        ].join(','));
      });
    }
    return lines.join('\n');
  };

  return {
    FACTORS,
    DEFAULT_WEIGHTS,
    loadResults,
    parseEntries,
    groupRaces,
    summarize,
    analyze,
    buildModel,
    predict,
    backtest,
    generateDemoCsv,
  };
})();
