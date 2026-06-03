/**
 * Голосование жетонами, playstyle / drift радара, фракции.
 * Подключается на странице статистики и досье.
 */
(function (global) {
  'use strict';

  const STAT_NAMES = ['Адекватность', 'Скилл', 'Интрига', 'Орешки', 'Стойкость', 'Убеждение'];

  const PLAYSTYLE_CONFIG = {
    statStepCap: 0.2,
    roundStep: 0.1,
    maxDriftPerStat: 2,
    minGamesForFaction: 12,
    factionHysteresis: 0.08,
    renouncedFaction: 'Отречённые'
  };

  const FACTION_KEYS = ['ambition', 'order', 'spectacle', 'chaosJoy'];

  const NOMINATION_CATEGORIES = [
    { id: 'spectacle', label: 'Великолепная игра', factions: { spectacle: 4 }, stats: { 'Интрига': 0.12, 'Орешки': 0.06 } },
    { id: 'strategy', label: 'Гениальная стратегия', factions: { order: 2, ambition: 2 }, stats: { 'Скилл': 0.14 } },
    { id: 'chaos', label: 'Снова творил хаос', factions: { chaosJoy: 5 }, stats: { 'Орешки': 0.08, 'Интрига': 0.06 } },
    { id: 'ambition', label: 'Жажда победы', factions: { ambition: 5 }, stats: { 'Убеждение': 0.1, 'Орешки': 0.08 } },
    { id: 'table', label: 'Держал стол', factions: { order: 5 }, stats: { 'Адекватность': 0.14, 'Стойкость': 0.06 } },
    { id: 'clutch', label: 'Ва-банк / на кону', factions: { ambition: 2 }, stats: { 'Орешки': 0.16 } },
    { id: 'diplomacy', label: 'Сильная дипломатия', factions: { order: 2, ambition: 1 }, stats: { 'Убеждение': 0.14 } },
    { id: 'endurance', label: 'Собран до конца', factions: { order: 3 }, stats: { 'Стойкость': 0.14 } },
    { id: 'mentor', label: 'Помог / объяснял', factions: { order: 4 }, stats: { 'Адекватность': 0.14 } },
    { id: 'mindgames', label: 'Игра в голове', factions: { spectacle: 3 }, stats: { 'Интрига': 0.12, 'Скилл': 0.06 } },
    { id: 'betrayal', label: 'Красивое предательство', factions: { spectacle: 4, ambition: 1 }, stats: { 'Интрига': 0.14 } },
    { id: 'pressure', label: 'Давил без срыва', factions: { ambition: 3 }, stats: { 'Стойкость': 0.1, 'Убеждение': 0.08 } },
    { id: 'wildcard', label: 'Неожиданный ход', factions: { chaosJoy: 3, spectacle: 1 }, stats: { 'Интрига': 0.08, 'Скилл': 0.08 } },
    { id: 'comedian', label: 'Разрядил обстановку', factions: { chaosJoy: 4 }, stats: { 'Адекватность': 0.1 } },
    { id: 'carry', label: 'Потащил команду', factions: { ambition: 4 }, stats: { 'Скилл': 0.1, 'Стойкость': 0.08 } },
    { id: 'fallen', label: 'Эпично погиб', factions: { spectacle: 2, chaosJoy: 2 }, stats: { 'Орешки': 0.12 } },
    { id: 'fairplay', label: 'Честная игра', factions: { order: 4 }, stats: { 'Адекватность': 0.12 } },
    { id: 'slowburn', label: 'Долгий план сработал', factions: { order: 2, spectacle: 2 }, stats: { 'Интрига': 0.1, 'Скилл': 0.08 } },
    { id: 'storm', label: 'Шатал стол', factions: { spectacle: 3, chaosJoy: 2 }, stats: { 'Интрига': 0.1, 'Орешки': 0.06 } },
    { id: 'zen', label: 'Пофиг на счёт', factions: { chaosJoy: 5 }, stats: { 'Адекватность': 0.06 } }
  ];

  const FACTION_LABELS = {
    ambition: 'Достоинство',
    order: 'Порядок',
    spectacle: 'Распад',
    chaosJoy: 'Культ Хаоса'
  };

  function getCategoryById(id) {
    return NOMINATION_CATEGORIES.find(c => c.id === id);
  }

  function roundStat(v) {
    const step = PLAYSTYLE_CONFIG.roundStep;
    return Math.round(v / step) * step;
  }

  function clampStat(v) {
    return Math.max(-5, Math.min(5, roundStat(v)));
  }

  function randomToken(len = 16) {
    const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function defaultPlayerPlaystyle() {
    return {
      sample: 0,
      drift: {},
      indices: { ambition: 0, order: 0, spectacle: 0, chaosJoy: 0 },
      suggestedFaction: null,
      factionConfidence: 0
    };
  }

  function ensurePlaystyleState(state) {
    if (!state.playstyle) {
      state.playstyle = {
        version: 1,
        players: {}
      };
    }
    if (!state.playstyle.players) state.playstyle.players = {};
    (state.players || []).forEach(name => {
      if (!state.playstyle.players[name]) {
        state.playstyle.players[name] = defaultPlayerPlaystyle();
      }
      if (!state.playstyle.players[name].drift) state.playstyle.players[name].drift = {};
    });
  }

  function getSessionParticipants(session, roster) {
    const set = new Set();
    (session.roles || []).forEach(r => {
      if (r.player && r.player !== 'Гость' && roster.includes(r.player)) set.add(r.player);
    });
    return [...set];
  }

  function ensureSessionNomination(session, roster) {
    const participants = getSessionParticipants(session, roster);
    if (!session.nomination) {
      session.nomination = {
        status: 'open',
        token: randomToken(),
        confirmed: [],
        participantCount: participants.length,
        ballotCount: 0
      };
    } else if (!session.nomination.token) {
      session.nomination.token = randomToken();
    }
    session.nomination.participantCount = participants.length;
    return session.nomination;
  }

  function votesRequired(participantCount) {
    return Math.ceil(participantCount / 2);
  }

  function aggregateConfirmed(ballots, participantCount) {
    const required = votesRequired(participantCount);
    const counts = new Map();

    ballots.forEach(b => {
      (b.tokens || []).forEach(t => {
        if (!t?.player || !t?.category) return;
        const key = `${t.player}\0${t.category}`;
        if (!counts.has(key)) counts.set(key, new Set());
        counts.get(key).add(b.voter);
      });
    });

    const confirmed = [];
    counts.forEach((voters, key) => {
      if (voters.size < required) return;
      const sep = key.indexOf('\0');
      const player = key.slice(0, sep);
      const category = key.slice(sep + 1);
      const cat = getCategoryById(category);
      confirmed.push({
        player,
        category,
        label: cat?.label || category,
        votes: voters.size,
        required
      });
    });
    return confirmed.sort((a, b) => b.votes - a.votes || a.player.localeCompare(b.player, 'ru'));
  }

  function capStatDeltas(deltas) {
    const cap = PLAYSTYLE_CONFIG.statStepCap;
    const out = {};
    let total = 0;
    Object.entries(deltas).forEach(([k, v]) => {
      total += Math.abs(v);
    });
    if (total <= cap) return { ...deltas };
    const scale = cap / total;
    Object.entries(deltas).forEach(([k, v]) => {
      out[k] = roundStat(v * scale);
    });
    return out;
  }

  function applyConfirmedToPlaystyle(state, confirmed, roster) {
    ensurePlaystyleState(state);
    const byPlayer = {};
    confirmed.forEach(c => {
      if (!byPlayer[c.player]) byPlayer[c.player] = {};
      const cat = getCategoryById(c.category);
      if (!cat) return;
      Object.entries(cat.stats || {}).forEach(([stat, v]) => {
        byPlayer[c.player][stat] = (byPlayer[c.player][stat] || 0) + v;
      });
      Object.entries(cat.factions || {}).forEach(([fk, v]) => {
        const p = state.playstyle.players[c.player];
        if (!p) return;
        p.indices[fk] = (p.indices[fk] || 0) + v;
      });
    });

    Object.entries(byPlayer).forEach(([player, statDeltas]) => {
      if (!roster.includes(player)) return;
      const p = state.playstyle.players[player];
      const capped = capStatDeltas(statDeltas);
      Object.entries(capped).forEach(([stat, delta]) => {
        const prev = p.drift[stat] || 0;
        const next = Math.max(
          -PLAYSTYLE_CONFIG.maxDriftPerStat,
          Math.min(PLAYSTYLE_CONFIG.maxDriftPerStat, prev + delta)
        );
        p.drift[stat] = roundStat(next);
      });
    });
  }

  function recomputeFactionSuggestions(state, roster) {
    ensurePlaystyleState(state);
    const minGames = PLAYSTYLE_CONFIG.minGamesForFaction;

    roster.forEach(name => {
      const p = state.playstyle.players[name];
      p.sample = state.sessions.filter(s =>
        (s.roles || []).some(r => r.player === name)
      ).length;

      if (p.sample < minGames) {
        p.suggestedFaction = PLAYSTYLE_CONFIG.renouncedFaction;
        p.factionConfidence = p.sample / minGames;
        return;
      }

      const scores = FACTION_KEYS.map(k => ({ key: k, val: p.indices[k] || 0 }));
      scores.sort((a, b) => b.val - a.val);
      const top = scores[0];
      const second = scores[1] || { val: 0 };
      const sum = scores.reduce((a, s) => a + s.val, 0) || 1;

      if (top.val < 3 || (top.val - second.val) < 2) {
        p.suggestedFaction = PLAYSTYLE_CONFIG.renouncedFaction;
        p.factionConfidence = Math.min(0.5, top.val / sum);
        return;
      }

      p.suggestedFaction = FACTION_LABELS[top.key];
      p.factionConfidence = Math.min(1, top.val / sum);
    });
  }

  function recalculatePlaystyle(state, roster) {
    ensurePlaystyleState(state);
    roster.forEach(name => {
      state.playstyle.players[name] = defaultPlayerPlaystyle();
    });

    const ordered = [...state.sessions].sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      return da.localeCompare(db) || (a.id - b.id);
    });

    ordered.forEach(session => {
      if (session.nomination?.status !== 'closed') return;
      const confirmed = session.nomination.confirmed || [];
      if (!confirmed.length) return;
      roster.forEach(name => {
        const p = state.playstyle.players[name];
        p.sample = state.sessions.filter(s =>
          (s.roles || []).some(r => r.player === name)
        ).length;
      });
      applyConfirmedToPlaystyle(state, confirmed, roster);
    });

    recomputeFactionSuggestions(state, roster);
  }

  function applyDriftToStats(baseStats, traitBlocks, playerName, state) {
    const vals = {};
    STAT_NAMES.forEach(n => { vals[n] = baseStats[n] ?? 0; });
    (traitBlocks || []).forEach(t => {
      if (!t.mods) return;
      Object.entries(t.mods).forEach(([k, v]) => { vals[k] = (vals[k] ?? 0) + v; });
    });
    const drift = state?.playstyle?.players?.[playerName]?.drift || {};
    STAT_NAMES.forEach(n => {
      vals[n] = clampStat((vals[n] ?? 0) + (drift[n] || 0));
    });
    return vals;
  }

  function supabaseAnonHeaders(url, key, json) {
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function fetchBallots(supabaseUrl, key, sessionId) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/session_ballots?session_id=eq.${sessionId}&select=voter,tokens,created_at`,
        { headers: { ...supabaseAnonHeaders(supabaseUrl, key), Prefer: 'return=representation' } }
      );
      if (res.status === 404 || res.status === 406 || res.status === 400) return null;
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async function submitBallot(supabaseUrl, key, sessionId, voteToken, voter, tokens) {
    const body = { session_id: sessionId, vote_token: voteToken, voter, tokens };
    const res = await fetch(`${supabaseUrl}/rest/v1/session_ballots`, {
      method: 'POST',
      headers: {
        ...supabaseAnonHeaders(supabaseUrl, key, true),
        Prefer: 'return=minimal,resolution=ignore-duplicates'
      },
      body: JSON.stringify(body)
    });
    if (res.status === 409) {
      throw new Error('Вы уже проголосовали в этой партии.');
    }
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 404 || (t && t.includes('relation'))) {
        throw new Error('Таблица голосований не настроена. Выполните supabase/nomination-setup.sql');
      }
      throw new Error(t || `submit ${res.status}`);
    }
    return true;
  }

  async function fetchNominationCloses(supabaseUrl, key) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/nomination_closes?select=session_id,confirmed,closed_at`,
      { headers: supabaseAnonHeaders(supabaseUrl, key) }
    );
    if (res.status === 404 || res.status === 406) return [];
    if (!res.ok) return [];
    return res.json();
  }

  async function insertNominationClose(supabaseUrl, key, sessionId, confirmed) {
    const res = await fetch(`${supabaseUrl}/rest/v1/nomination_closes`, {
      method: 'POST',
      headers: {
        ...supabaseAnonHeaders(supabaseUrl, key, true),
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify({ session_id: sessionId, confirmed })
    });
    return res.ok || res.status === 409;
  }

  async function mergeNominationClosesFromDb(supabaseUrl, key, state) {
    const rows = await fetchNominationCloses(supabaseUrl, key);
    if (!rows.length) return false;
    let changed = false;
    rows.forEach(row => {
      const s = state.sessions.find(x => x.id === row.session_id);
      if (!s) return;
      if (!s.nomination) s.nomination = { status: 'closed', confirmed: [] };
      if (s.nomination.status === 'closed' &&
          JSON.stringify(s.nomination.confirmed) === JSON.stringify(row.confirmed)) return;
      s.nomination.status = 'closed';
      s.nomination.confirmed = row.confirmed || [];
      s.nomination.closedAt = row.closed_at;
      changed = true;
    });
    return changed;
  }

  async function syncBallotCounts(supabaseUrl, key, state, roster) {
    const open = state.sessions.filter(s => s.nomination?.status === 'open');
    if (!open.length) return;
    await Promise.all(open.map(async session => {
      try {
        const ballots = await fetchBallots(supabaseUrl, key, session.id);
        if (!ballots) return;
        session.nomination.ballotCount = ballots.length;
        const parts = getSessionParticipants(session, roster);
        session.nomination.participantCount = parts.length;
      } catch { /* offline */ }
    }));
  }

  async function tryCloseNomination(supabaseUrl, key, state, roster, sessionId, voteToken) {
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session?.nomination || session.nomination.status === 'closed') return { closed: false };
    if (session.nomination.token !== voteToken) return { closed: false, error: 'Неверная ссылка' };

    const participants = getSessionParticipants(session, roster);
    const ballots = await fetchBallots(supabaseUrl, key, sessionId);
    if (!ballots) return { closed: false, error: 'Нет таблицы голосований' };

    const voters = new Set(ballots.map(b => b.voter));
    if (voters.size < participants.length) {
      return {
        closed: false,
        ballotCount: voters.size,
        need: participants.length,
        voterCount: voters.size
      };
    }

    const confirmed = aggregateConfirmed(ballots, participants.length);
    await insertNominationClose(supabaseUrl, key, sessionId, confirmed);

    session.nomination.status = 'closed';
    session.nomination.confirmed = confirmed;
    session.nomination.ballotCount = ballots.length;
    session.nomination.closedAt = new Date().toISOString();

    recalculatePlaystyle(state, roster);
    return { closed: true, confirmed };
  }

  async function deleteNominationDataForSession(supabaseUrl, key, sessionId, adminToken) {
    const h = {
      apikey: key,
      Authorization: `Bearer ${adminToken || key}`
    };
    await fetch(`${supabaseUrl}/rest/v1/session_ballots?session_id=eq.${sessionId}`, {
      method: 'DELETE', headers: h
    });
    await fetch(`${supabaseUrl}/rest/v1/nomination_closes?session_id=eq.${sessionId}`, {
      method: 'DELETE', headers: h
    });
  }

  function getVoteUrl(session, basePath) {
    const path = basePath || 'gemini-code-1780045779252.html';
    const t = session.nomination?.token || '';
    return `${path}?vote=${session.id}&t=${encodeURIComponent(t)}`;
  }

  global.Playstyle = {
    STAT_NAMES,
    PLAYSTYLE_CONFIG,
    NOMINATION_CATEGORIES,
    FACTION_LABELS,
    getCategoryById,
    roundStat,
    clampStat,
    randomToken,
    ensurePlaystyleState,
    ensureSessionNomination,
    getSessionParticipants,
    votesRequired,
    aggregateConfirmed,
    recalculatePlaystyle,
    applyDriftToStats,
    fetchBallots,
    submitBallot,
    mergeNominationClosesFromDb,
    syncBallotCounts,
    tryCloseNomination,
    deleteNominationDataForSession,
    getVoteUrl
  };
})(typeof window !== 'undefined' ? window : global);
