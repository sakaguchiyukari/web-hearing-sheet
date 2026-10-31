/**
 * Turf Lens - UI制御
 * 計算処理は analyzer.js（window.KeibaAnalyzer）に委譲する
 */
'use strict';

(() => {
  const A = window.KeibaAnalyzer;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /** アプリの状態 */
  const state = {
    rows: null,
    model: null,
    dim: 'popularity',
  };

  /* =========================================================
     フォーマット・共通処理
     ========================================================= */
  const fmt = {
    pct: (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`),
    int: (v) => Number(v).toLocaleString('ja-JP'),
    odds: (v) => (v ? `${v.toFixed(1)}倍` : '—'),
    ev: (v) => (v === null ? '—' : v.toFixed(2)),
    signed: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`,
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /** ステータス表示（type: 'success' | 'error' | ''） */
  const setStatus = (el, message, type = '') => {
    el.textContent = message;
    el.classList.toggle('is-error', type === 'error');
    el.classList.toggle('is-success', type === 'success');
  };

  /** HTML5バリデーション＋エラー表示 */
  const validateForm = (form, statusEl) => {
    $$('[required]', form).forEach((el) => el.classList.toggle('is-invalid', !el.checkValidity()));
    const firstInvalid = $$('input, select, textarea', form).find((el) => !el.checkValidity());
    if (firstInvalid) {
      const label = $(`label[for="${firstInvalid.id}"]`, form);
      const name = label ? label.textContent.replace('必須', '').trim() : '入力項目';
      setStatus(statusEl, `${name}：${firstInvalid.validationMessage}`, 'error');
      firstInvalid.focus();
      return false;
    }
    return true;
  };

  /* =========================================================
     フェードイン（IntersectionObserver）
     ========================================================= */
  const fadeObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 })
    : null;

  const observeFade = (root = document) => {
    $$('.js-fade:not(.is-visible)', root).forEach((el) => {
      if (fadeObserver) fadeObserver.observe(el); else el.classList.add('is-visible');
    });
  };

  /* =========================================================
     01. データ読込
     ========================================================= */
  const dataForm = $('#dataForm');
  const dataStatus = $('#dataStatus');

  const readFile = async (file, encoding) => {
    const buffer = await file.arrayBuffer();
    return new TextDecoder(encoding).decode(buffer);
  };

  const loadData = (text, label, isDemo) => {
    try {
      const result = A.loadResults(text);
      state.rows = result.rows;
      state.model = A.buildModel(result.rows);

      renderSummary(result, isDemo);
      populateFilters();
      renderAnalysis();

      const warnings = [];
      if (result.skipped) warnings.push(`着順が数値でない${fmt.int(result.skipped)}行を除外`);
      if (!result.hasOdds) warnings.push('単勝オッズ列が無いため回収率・期待値は計算できません');
      if (result.usedRaceNameOnly) warnings.push('レース番号が無いため、同日同場の同名レースは1レースとして扱われます');
      setStatus(dataStatus, `「${label}」を読み込みました。${warnings.join(' / ')}`, 'success');
    } catch (err) {
      setStatus(dataStatus, err.message, 'error');
    }
  };

  dataForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(dataForm, dataStatus)) return;
    const file = $('#csvFile').files[0];
    if (file.size > 50 * 1024 * 1024) {
      setStatus(dataStatus, 'ファイルサイズは50MB以下にしてください。', 'error');
      return;
    }
    try {
      const text = await readFile(file, $('#csvEncoding').value);
      loadData(text, file.name, false);
    } catch (err) {
      setStatus(dataStatus, `読み込みに失敗しました：${err.message}`, 'error');
    }
  });

  $('#sampleBtn').addEventListener('click', () => {
    loadData(A.generateDemoCsv(), 'デモ用の架空データ', true);
  });

  const renderSummary = (result, isDemo) => {
    const s = A.summarize(result.rows);
    $('#sumRaces').textContent = fmt.int(s.races);
    $('#sumRunners').textContent = fmt.int(s.runners);
    $('#sumFav').textContent = fmt.pct(s.favWinRate);
    $('#sumRecovery').textContent = fmt.pct(s.allRecovery);
    $('#sumMeta').textContent = `期間：${s.from} 〜 ${s.to}　/　1番人気の単勝回収率：${fmt.pct(s.favRecovery)}`;
    $('#demoBadge').hidden = !isDemo;
    $('#summaryWrap').hidden = false;
    observeFade($('#summaryWrap'));
  };

  /* =========================================================
     02. 傾向分析
     ========================================================= */
  const filterCourse = $('#filterCourse');
  const filterSurface = $('#filterSurface');
  const filterMinN = $('#filterMinN');

  const fillSelect = (select, values) => {
    select.innerHTML = '<option value="">すべて</option>'
      + values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  };

  const populateFilters = () => {
    const uniq = (key) => [...new Set(state.rows.map((r) => r[key]).filter(Boolean))].sort();
    fillSelect(filterCourse, uniq('course'));
    fillSelect(filterSurface, uniq('surface'));
    $('#analysisEmpty').hidden = true;
    $('#analysisBody').hidden = false;
  };

  const renderAnalysis = () => {
    if (!state.rows) return;
    const minN = Math.max(1, Number(filterMinN.value) || 1);
    const { list, total } = A.analyze(state.rows, state.dim, {
      course: filterCourse.value,
      surface: filterSurface.value,
      minN,
    });

    const maxWin = Math.max(...list.map((r) => r.winRate), 0.0001);
    $('#analysisTbody').innerHTML = list.length
      ? list.map((r) => `
        <tr>
          <th scope="row">${escapeHtml(r.label)}</th>
          <td>${fmt.int(r.n)}</td>
          <td>
            <span class="meter">
              <span class="meter__track"><span class="meter__bar" style="--value: ${(r.winRate / maxWin) * 100}%"></span></span>
              <span class="meter__label">${fmt.pct(r.winRate)}</span>
            </span>
          </td>
          <td>${fmt.pct(r.placeRate)}</td>
          <td class="${r.recovery !== null && r.recovery >= 1 ? 'is-plus' : 'is-minus'}">${fmt.pct(r.recovery)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">条件に合うデータがありません。最低出走数を下げてください。</td></tr>';

    $('#analysisNote').textContent = `対象：${fmt.int(total)}走。単勝回収率は該当馬すべてに単勝100円を買った場合の値です。出走数が少ない区分は偶然の影響が大きくなります。`;
  };

  $$('.tabs__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.dim = btn.dataset.dim;
      $$('.tabs__btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderAnalysis();
    });
  });

  [filterCourse, filterSurface, filterMinN].forEach((el) => el.addEventListener('change', renderAnalysis));

  /* =========================================================
     03. 予想
     ========================================================= */
  const predictForm = $('#predictForm');
  const predictStatus = $('#predictStatus');
  const weightsGrid = $('#weightsGrid');

  /** 重みスライダーを生成 */
  const renderWeights = () => {
    weightsGrid.innerHTML = A.FACTORS.map((f) => `
      <label class="weight">
        <span class="weight__name">${f.label}</span>
        <output class="weight__value" id="wOut-${f.id}">${A.DEFAULT_WEIGHTS[f.id].toFixed(1)}</output>
        <input class="weight__range" type="range" min="0" max="2" step="0.1"
          value="${A.DEFAULT_WEIGHTS[f.id]}" data-factor="${f.id}" aria-label="${f.label}の重み">
      </label>`).join('');
  };

  const getWeights = () => Object.fromEntries(
    $$('.weight__range', weightsGrid).map((el) => [el.dataset.factor, Number(el.value)]),
  );

  weightsGrid.addEventListener('input', (e) => {
    if (!e.target.matches('.weight__range')) return;
    $(`#wOut-${e.target.dataset.factor}`).textContent = Number(e.target.value).toFixed(1);
  });

  $('#resetWeightsBtn').addEventListener('click', () => {
    $$('.weight__range', weightsGrid).forEach((el) => {
      el.value = A.DEFAULT_WEIGHTS[el.dataset.factor];
      $(`#wOut-${el.dataset.factor}`).textContent = Number(el.value).toFixed(1);
    });
  });

  /** 選択肢に無い値（地方競馬場など）は追加してから選択 */
  const setSelectValue = (select, value) => {
    if (!value) { select.value = ''; return; }
    if (![...select.options].some((o) => o.value === value)) select.add(new Option(value, value));
    select.value = value;
  };

  /** データ内の最新レースを出走表に流し込む（動作確認用） */
  $('#loadLatestBtn').addEventListener('click', () => {
    if (!state.rows) {
      setStatus(predictStatus, '先に過去成績データを読み込んでください。', 'error');
      return;
    }
    const races = A.groupRaces(state.rows);
    const race = races[races.length - 1];
    setSelectValue($('#raceCourse'), race.course);
    setSelectValue($('#raceSurface'), race.surface);
    $('#raceDistance').value = race.distance || '';
    setSelectValue($('#raceGoing'), race.going);

    const lines = ['馬番,枠番,馬名,騎手,調教師,人気,単勝オッズ'];
    [...race.runners].sort((a, b) => (a.number || 0) - (b.number || 0)).forEach((r) => {
      lines.push([r.number ?? '', r.frame ?? '', r.horse, r.jockey ?? '', r.trainer ?? '', r.popularity ?? '', r.odds ?? ''].join(','));
    });
    $('#entries').value = lines.join('\n');
    setStatus(predictStatus, `${race.date} ${race.course} ${race.raceNo ? `${race.raceNo}R` : ''} を入力しました（このレースは学習データに含まれます）。`, 'success');
  });

  predictForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(predictForm, predictStatus)) return;
    if (!state.model) {
      setStatus(predictStatus, '先に過去成績データを読み込んでください。', 'error');
      $('#data').scrollIntoView();
      return;
    }

    try {
      const entries = A.parseEntries($('#entries').value);
      const race = {
        course: $('#raceCourse').value,
        surface: $('#raceSurface').value,
        distance: Number($('#raceDistance').value),
        going: $('#raceGoing').value,
      };
      const preds = A.predict(state.model, race, entries, getWeights());
      renderPrediction(race, preds);
      setStatus(predictStatus, `${entries.length}頭の予想を出しました。`, 'success');
    } catch (err) {
      setStatus(predictStatus, err.message, 'error');
    }
  });

  const factorLabel = Object.fromEntries(A.FACTORS.map((f) => [f.id, f.label]));

  const renderPrediction = (race, preds) => {
    const hasOdds = preds.some((p) => p.ev !== null);
    $('#predictMeta').textContent = `${race.course} ${race.surface}${race.distance}m${race.going ? `（${race.going}）` : ''}　/　推定勝率は合計100%。期待値は推定勝率×単勝オッズ${hasOdds ? '' : '（オッズ未入力のため計算なし）'}`;

    $('#predictList').innerHTML = preds.map((p, i) => {
      const e = p.entry;
      const meta = [e.number && `${e.number}番`, e.frame && `${e.frame}枠`, e.jockey, e.popularity && `${e.popularity}番人気`]
        .filter(Boolean).map(escapeHtml).join(' ・ ');
      const factors = A.FACTORS.map((f) => {
        const d = p.factors[f.id];
        const detail = d.n ? `${fmt.int(d.n)}走 勝率${fmt.pct(d.rate)}` : 'データなし';
        const cls = d.lift > 0.05 ? 'is-plus' : d.lift < -0.05 ? 'is-minus' : '';
        return `<li class="factor-list__item"><span>${factorLabel[f.id]}：${detail}</span><span class="factor-list__value ${cls}">${fmt.signed(d.lift)}</span></li>`;
      }).join('');

      return `
        <li class="rank-card ${i === 0 ? 'rank-card--top' : ''} js-fade">
          <div class="rank-card__mark" aria-label="${i + 1}位">${p.mark || i + 1}</div>
          <div class="rank-card__main">
            <p class="rank-card__meta">${meta}</p>
            <h3 class="rank-card__name">${escapeHtml(e.horse)}</h3>
          </div>
          <dl class="rank-card__stats">
            <div><dt>推定勝率</dt><dd>${fmt.pct(p.prob)}</dd></div>
            <div><dt>単勝</dt><dd>${fmt.odds(e.odds)}</dd></div>
            <div><dt>期待値</dt><dd class="${p.ev !== null && p.ev >= 1 ? 'rank-card__ev--plus' : ''}">${fmt.ev(p.ev)}</dd></div>
          </dl>
          <details class="rank-card__detail">
            <summary>根拠を見る（各ファクターの寄与）</summary>
            <ul class="factor-list">${factors}</ul>
          </details>
        </li>`;
    }).join('');

    $('#predictResult').hidden = false;
    observeFade($('#predictResult'));
  };

  /* =========================================================
     04. バックテスト
     ========================================================= */
  const backtestForm = $('#backtestForm');
  const backtestStatus = $('#backtestStatus');

  const btCard = ({ label, desc, data, base = false, showPlace = true }) => {
    const rec = data.recovery;
    const cls = rec === null ? '' : rec >= 1 ? 'is-plus' : 'is-minus';
    return `
      <article class="bt-card ${base ? 'bt-card--base' : ''} js-fade">
        <h3 class="bt-card__label">${label}</h3>
        <p class="bt-card__desc">${desc}</p>
        <p class="bt-card__recovery ${cls}">${fmt.pct(rec)}<span class="bt-card__unit">単勝回収率</span></p>
        <dl class="bt-card__list">
          <div><dt>購入数</dt><dd>${fmt.int(data.bets)}</dd></div>
          <div><dt>的中率</dt><dd>${fmt.pct(data.hitRate)}</dd></div>
          ${data.avgProb ? `<div><dt>推定勝率の平均</dt><dd>${fmt.pct(data.avgProb)}</dd></div>` : ''}
          ${showPlace ? `<div><dt>3着内率</dt><dd>${fmt.pct(data.placeRate)}</dd></div>` : ''}
        </dl>
      </article>`;
  };

  backtestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(backtestForm, backtestStatus)) return;
    if (!state.rows) {
      setStatus(backtestStatus, '先に過去成績データを読み込んでください。', 'error');
      return;
    }
    try {
      const threshold = Number($('#evThreshold').value);
      const r = A.backtest(state.rows, getWeights(), threshold);
      $('#backtestPeriod').textContent = `学習：${r.train.from}〜${r.train.to}（${fmt.int(r.train.races)}R）　/　検証：${r.test.from}〜${r.test.to}（${fmt.int(r.test.races)}R）　/　現在の重みで計算`;
      $('#backtestCards').innerHTML = [
        btCard({ label: 'モデルの◎（本命）', desc: '各レースで推定勝率1位の単勝を100円', data: r.model }),
        btCard({ label: `期待値 ${threshold.toFixed(2)} 以上`, desc: '基準を超えた馬すべての単勝を100円', data: r.ev, showPlace: false }),
        btCard({ label: '比較：1番人気', desc: '毎レース1番人気の単勝を100円', data: r.fav, base: true }),
      ].join('');
      $('#backtestResult').hidden = false;
      observeFade($('#backtestResult'));
      setStatus(backtestStatus, '検証が完了しました。', 'success');
    } catch (err) {
      setStatus(backtestStatus, err.message, 'error');
    }
  });

  /* =========================================================
     SP固定CTA：予想セクション表示中は隠す
     ========================================================= */
  const spCta = $('#spCta');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      spCta.classList.toggle('is-hidden', entry.isIntersecting);
    }, { threshold: 0.15 }).observe($('#predictForm'));
  }

  /* =========================================================
     初期化
     ========================================================= */
  renderWeights();
  observeFade();
})();
