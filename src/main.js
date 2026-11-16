// ARCANE DUEL — bootstrap, DOM menus, main loop, screenshot staging.
import { Game } from './game.js';
import { Renderer, loadAssets } from './render.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { HEROES, ARENAS, ARENA_ORDER, DIFFICULTY, WEAPONS, WEAPON_ORDER, SHOP_PRICES, FREE_WEAPONS, CHALLENGES, CHALLENGE_ORDER, QUALITY } from './config.js';

const CAMPAIGN = [
  // v3 — 6 battles: the Mist Forest monsters join the roster (Perjuangan
  // Semut-inspired). The final boss is still Elite Bront.
  { ai: 'kumbang', diff: 'easy', arena: 'valley' },
  { ai: 'nyx', diff: 'normal', arena: 'canyon' },
  { ai: 'tawon', diff: 'normal', arena: 'temple' },
  { ai: 'momok', diff: 'hard', arena: 'valley' },
  { ai: 'bront', diff: 'hard', arena: 'canyon' },
  { ai: 'bront', diff: 'elite', arena: 'temple', elite: true },
];
window.__CAMPAIGN = CAMPAIGN;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = new AudioSys();
const game = new Game(audio);
const renderer = new Renderer(ctx);
window.__game = game;
window.__renderer = renderer; // v3 — probe reads uiRegions (POW FIRE button etc.)
window.__shotReady = false;

const $ = id => document.getElementById(id);
const overlays = ['ov-menu', 'ov-select', 'ov-pause', 'ov-over', 'ov-settings', 'ov-credits', 'ov-howto', 'ov-shop', 'ov-challenge'];
function show(id) {
  for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
  if (!id) for (const o of overlays) $(o).classList.add('hidden');
}
function status(msg) { $('status').textContent = msg; }

// ------------------------------------------------------------ Android v2 Tahap B: campaign progress save
// (localStorage arcane-duel-progress: the next battle to play + hero + diff).
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem('arcane-duel-progress') || 'null');
    if (p && typeof p.index === 'number' && p.index >= 0 && p.index < CAMPAIGN.length
      && typeof p.hero === 'string' && HEROES[p.hero] && !HEROES[p.hero].enemyOnly) return p;
  } catch (e) { /* ignore */ }
  return null;
}
function saveProgress(index, hero, diff) {
  try { localStorage.setItem('arcane-duel-progress', JSON.stringify({ index, hero, diff: diff || CAMPAIGN[index].diff })); } catch (e) { /* ignore */ }
}
function clearProgress() { try { localStorage.removeItem('arcane-duel-progress'); } catch (e) { /* ignore */ } }
function refreshMenuButtons() {
  const pr = loadProgress();
  const cont = document.querySelector('[data-act="continue"]');
  if (cont) {
    cont.classList.toggle('hidden', !pr);
    if (pr) cont.textContent = `▶ Continue Campaign — Battle ${pr.index + 1} of ${CAMPAIGN.length}`;
  }
  const mp = $('menu-progress');
  if (mp) mp.textContent = game.survivalBest > 0 ? `🌊 Survival best: Wave ${game.survivalBest}` : '';
}

// ------------------------------------------------------------ Android v2 Tahap B: fullscreen (safe fallback)
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(() => { /* refused: stay windowed */ });
    } else if (document.documentElement.requestFullscreen) {
      const p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => { status('Fullscreen was refused by the browser'); });
    }
  } catch (e) { /* fullscreen unavailable on this browser */ }
}

// ------------------------------------------------------------ select flow
const sel = { mode: null, step: 1, p1: 'kairo', p2: 'nyx', arena: 'valley', diff: 'normal', challengeId: 'oneshot' };
let lastBattleOpts = null;

function renderSelect() {
  const cards = $('sel-cards');
  cards.innerHTML = '';
  const stepHero = sel.step === 1 ? 'p1' : 'p2';
  $('sel-title').textContent = sel.mode === 'versus'
    ? (sel.step === 1 ? 'Player 1 — Choose Your Warrior' : 'Player 2 — Choose Your Warrior')
    : sel.mode === 'survival' ? 'Survival — Choose Your Warrior'
    : sel.mode === 'challenge' ? `🏆 ${CHALLENGES[sel.challengeId].name} — Choose Your Warrior`
    : 'Choose Your Warrior';
  for (const id of Object.keys(HEROES).filter(h => !HEROES[h].enemyOnly)) { // v3 — monsters are enemies only
    const h = HEROES[id];
    const el = document.createElement('div');
    el.className = 'card' + (sel[stepHero] === id ? ' sel' : '');
    el.innerHTML = `<img src="assets/${id}_idle_0.png" alt="${h.name}"><h3>${h.name}</h3><div class="el">${h.element.toUpperCase()} • ${h.title}</div><p>${h.desc}</p><div style="font-size:12px;color:#ffd76a">${h.skill1.name} • ${h.skill2.name} • ★ ${h.ult.name}</div>`;
    el.onclick = () => { audio.ensure(); audio.click(); sel[stepHero] = id; renderSelect(); };
    cards.appendChild(el);
  }
  const extra = $('sel-extra');
  extra.innerHTML = '';
  if (sel.mode === 'campaign') {
    extra.innerHTML = '<div style="margin:6px 0 2px;color:#ffd76a">Difficulty</div>';
    const row = document.createElement('div'); row.className = 'pickrow';
    for (const d of Object.keys(DIFFICULTY)) {
      const b = document.createElement('button');
      b.className = 'pick' + (sel.diff === d ? ' sel' : '');
      b.textContent = DIFFICULTY[d].name;
      b.onclick = () => { sel.diff = d; renderSelect(); };
      row.appendChild(b);
    }
    extra.appendChild(row);
  } else if (sel.mode === 'versus') {
    extra.innerHTML = '<div style="margin:6px 0 2px;color:#ffd76a">Arena</div>';
    const row = document.createElement('div'); row.className = 'pickrow';
    for (const a of ARENA_ORDER) {
      const b = document.createElement('button');
      b.className = 'pick' + (sel.arena === a ? ' sel' : '');
      b.textContent = ARENAS[a].name;
      b.onclick = () => { sel.arena = a; renderSelect(); };
      row.appendChild(b);
    }
    extra.appendChild(row);
  }
  $('sel-start').textContent = sel.mode === 'versus' && sel.step === 1 ? 'Next: Player 2 →' : 'Start Duel';
}

function openSelect(mode) {
  sel.mode = mode; sel.step = 1; sel.p1 = 'kairo'; sel.p2 = 'nyx';
  renderSelect(); show('ov-select');
}

function launchBattle(opts) {
  lastBattleOpts = opts;
  game.startBattle(opts);
  game.campaignHero = opts.p1Hero;
  // Android v2 Tahap B — auto-save the campaign battle just started, so
  // "Continue Campaign" can pick it up after a reload.
  if (opts.mode === 'campaign') saveProgress(opts.campaignIndex || 0, opts.p1Hero, opts.p2AI);
  show(null);
  status(`Battle started in ${ARENAS[opts.arena].name}`);
}

// Android v2 Tahap B — campaign / survival / challenge launchers.
function launchCampaignBattle(index, hero, diff) {
  const b = CAMPAIGN[index];
  const d = diff || b.diff;
  launchBattle({ mode: 'campaign', arena: b.arena, p1Hero: hero, p2Hero: b.ai, p2AI: d, campaignIndex: index, elite: !!b.elite, campaignTotal: CAMPAIGN.length });
  game.campaignDiff = d;
}
function launchSurvival(hero, wave) {
  const spec = game.survivalSpec(wave);
  game.survivalHero = hero;
  launchBattle({ mode: 'survival', survivalWave: wave, arena: spec.arena, p1Hero: hero, p2Hero: spec.ai, p2AI: spec.diff, elite: spec.elite });
}
// One-Shot faces the weakest foe (80 HP Tawon) so a single ultimate can
// finish it; No Miss / Speed Run face Nyx (100 HP, normal AI).
const CHALLENGE_FOE = { oneshot: { ai: 'tawon', arena: 'valley' }, nomiss: { ai: 'nyx', arena: 'valley' }, speedrun: { ai: 'nyx', arena: 'valley' } };
function launchChallenge(hero, challengeId) {
  const foe = CHALLENGE_FOE[challengeId] || CHALLENGE_FOE.oneshot;
  launchBattle({ mode: 'challenge', challengeId, arena: foe.arena, p1Hero: hero, p2Hero: foe.ai, p2AI: 'normal' });
}

// Android v2 Tahap B — challenge picker overlay (3 fixed challenges).
function renderChallenges() {
  const list = $('challenge-list');
  list.innerHTML = '';
  for (const id of CHALLENGE_ORDER) {
    const c = CHALLENGES[id];
    const done = game.challengesDone.has(id);
    const row = document.createElement('div');
    row.className = 'pickrow';
    row.style.cssText = 'justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;margin:6px 0;text-align:left;';
    const left = document.createElement('div');
    left.innerHTML = `<b>${c.icon} ${c.name}</b> <span style="color:#bbb;font-size:13px">${c.desc}</span>`;
    if (done) left.innerHTML += ' <span style="color:#58d158">✓ COMPLETED</span>';
    row.appendChild(left);
    const btn = document.createElement('button');
    btn.className = 'pick sel';
    btn.textContent = done ? 'Play Again' : 'Play';
    btn.onclick = () => { audio.ensure(); audio.click(); sel.challengeId = id; openSelect('challenge'); };
    row.appendChild(btn);
    list.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:13px;color:#bbb;margin-top:8px;';
  note.textContent = 'Each challenge is a duel against a normal AI with a special win condition. Complete one to earn +50 🪙.';
  list.appendChild(note);
}
$('challenge-back').onclick = () => { audio.click(); show('ov-menu'); };

$('sel-start').onclick = () => {
  audio.ensure(); audio.click();
  if (sel.mode === 'versus' && sel.step === 1) { sel.step = 2; renderSelect(); return; }
  if (sel.mode === 'campaign') {
    // Android v2 Tahap A — the difficulty picked here drives battle 1
    // (Expert included); later battles follow the CAMPAIGN table, and the
    // elite final boss always stays elite. The default (Adept) keeps the
    // original easy first battle.
    const firstDiff = sel.diff === 'normal' ? CAMPAIGN[0].diff : sel.diff;
    launchCampaignBattle(0, sel.p1, firstDiff);
  } else if (sel.mode === 'survival') {
    launchSurvival(sel.p1, 1);
  } else if (sel.mode === 'challenge') {
    launchChallenge(sel.p1, sel.challengeId);
  } else if (sel.mode === 'versus') {
    launchBattle({ mode: 'versus', arena: sel.arena, p1Hero: sel.p1, p2Hero: sel.p2, p2AI: null });
  } else if (sel.mode === 'training') {
    launchBattle({ mode: 'training', arena: 'valley', p1Hero: sel.p1, p2Hero: 'bront', p2AI: 'dummy' });
    game.setBanner('TRAINING', game._trainingTipText(), 3);
  }
};
$('sel-back').onclick = () => { audio.click(); show('ov-menu'); };

// ------------------------------------------------------------ v3: weapon shop
function renderShop() {
  $('shop-coins').textContent = `🪙 ${game.coins} Duel Coins — win battles to earn more (Campaign +100, Versus +50)`;
  const list = $('shop-list');
  list.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const owned = game.ownsWeapon(id);
    const price = SHOP_PRICES[id];
    const row = document.createElement('div');
    row.className = 'pickrow';
    row.style.cssText = 'justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;margin:6px 0;text-align:left;';
    const left = document.createElement('div');
    left.innerHTML = `<b>${w.name}</b> <span style="color:#bbb;font-size:13px">${w.desc}</span>`;
    if (owned && price) left.innerHTML += ' <span style="color:#58d158">✓ OWNED</span>';
    if (!price) left.innerHTML += ' <span style="color:#58d158">✓ FREE</span>';
    row.appendChild(left);
    const btn = document.createElement('button');
    btn.className = 'pick' + (owned ? '' : ' sel');
    btn.textContent = owned ? 'Owned' : `Buy — ${price} 🪙`;
    btn.disabled = owned || game.coins < price;
    btn.style.opacity = btn.disabled ? 0.55 : 1;
    btn.onclick = () => { audio.ensure(); if (game.buyWeapon(id)) { audio.click(); renderShop(); } else { audio.click(); } };
    row.appendChild(btn);
    list.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:13px;color:#bbb;margin-top:8px;';
  note.textContent = 'Bought weapons unlock for every battle. Locked weapons show 🔒 in the inventory and cannot be picked.';
  list.appendChild(note);
}
$('shop-back').onclick = () => { audio.click(); show('ov-menu'); };

// ------------------------------------------------------------ menu buttons
document.querySelectorAll('#ov-menu [data-act]').forEach(b => {
  b.onclick = () => {
    audio.ensure(); audio.click();
    const act = b.dataset.act;
    if (act === 'campaign' || act === 'versus' || act === 'training' || act === 'survival') openSelect(act);
    else if (act === 'challenge') { renderChallenges(); show('ov-challenge'); }
    else if (act === 'continue') { const pr = loadProgress(); if (pr) launchCampaignBattle(pr.index, pr.hero, pr.diff); }
    else if (act === 'fullscreen') toggleFullscreen();
    else if (act === 'howto') show('ov-howto');
    else if (act === 'settings') { syncSettings(); show('ov-settings'); }
    else if (act === 'credits') show('ov-credits');
    else if (act === 'shop') { renderShop(); show('ov-shop'); }
  };
});
$('howto-back').onclick = () => show('ov-menu');
$('credits-back').onclick = () => show('ov-menu');

// ------------------------------------------------------------ settings
function syncSettings() {
  $('set-music').value = audio.musicVol; $('set-sfx').value = audio.sfxVol; $('set-mute').checked = audio.muted;
  // Android v2 Tahap A — touch button size + opacity (own storage key).
  $('set-touch-scale').value = game.touchSettings.scale;
  $('set-touch-opacity').value = game.touchSettings.opacity;
  $('set-touch-scale-val').textContent = game.touchSettings.scale.toFixed(2) + '×';
  $('set-touch-opacity-val').textContent = Math.round(game.touchSettings.opacity * 100) + '%';
  // Android v2 Tahap B — graphics quality (field inside arcane-duel-settings).
  document.querySelectorAll('#set-quality .pick').forEach(b => b.classList.toggle('sel', b.dataset.q === game.quality));
}
document.querySelectorAll('#set-quality .pick').forEach(b => {
  b.onclick = () => { audio.ensure(); audio.click(); game.setQuality(b.dataset.q); syncSettings(); };
});
// Android v2 Tahap B — export / import save (all localStorage keys).
function collectSave() {
  return {
    version: 1, exportedAt: new Date().toISOString(),
    coins: game.coins, owned: [...game.owned],
    settings: JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}'),
    touch: JSON.parse(localStorage.getItem('arcane-duel-touch') || '{}'),
    progress: JSON.parse(localStorage.getItem('arcane-duel-progress') || 'null'),
    survivalBest: game.survivalBest,
    challenges: [...game.challengesDone],
  };
}
$('set-export').onclick = () => {
  audio.click();
  const blob = new Blob([JSON.stringify(collectSave(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'arcane-duel-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('set-save-status').textContent = 'Save exported — arcane-duel-save.json';
};
$('set-import').onclick = () => { audio.click(); $('set-import-file').click(); };
$('set-import-file').onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a save object');
      // Validate every field BEFORE touching storage; only known-good
      // values are applied, so a bad file changes nothing.
      if (typeof data.coins !== 'number' || data.coins < 0 || !Number.isFinite(data.coins)) throw new Error('bad coins');
      if (data.owned !== undefined && (!Array.isArray(data.owned) || data.owned.some(w => !WEAPON_ORDER.includes(w)))) throw new Error('bad owned weapons');
      if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null)) throw new Error('bad settings');
      if (data.touch !== undefined && (typeof data.touch !== 'object' || data.touch === null)) throw new Error('bad touch settings');
      if (data.progress !== undefined && data.progress !== null && (typeof data.progress !== 'object' || typeof data.progress.index !== 'number')) throw new Error('bad progress');
      if (data.survivalBest !== undefined && (typeof data.survivalBest !== 'number' || data.survivalBest < 0)) throw new Error('bad survival best');
      if (data.challenges !== undefined && (!Array.isArray(data.challenges) || data.challenges.some(c => !CHALLENGE_ORDER.includes(c)))) throw new Error('bad challenges');
      // Backup the current save first, then overwrite.
      localStorage.setItem('arcane-duel-backup', JSON.stringify(collectSave()));
      localStorage.setItem('arcane-duel-coins', String(Math.floor(data.coins)));
      if (data.owned !== undefined) localStorage.setItem('arcane-duel-shop-owned', JSON.stringify(data.owned));
      if (data.settings !== undefined) localStorage.setItem('arcane-duel-settings', JSON.stringify(data.settings));
      if (data.touch !== undefined) localStorage.setItem('arcane-duel-touch', JSON.stringify(data.touch));
      if (data.progress !== undefined) {
        if (data.progress === null) localStorage.removeItem('arcane-duel-progress');
        else localStorage.setItem('arcane-duel-progress', JSON.stringify(data.progress));
      }
      if (data.survivalBest !== undefined) localStorage.setItem('arcane-duel-survival-best', String(Math.floor(data.survivalBest)));
      if (data.challenges !== undefined) localStorage.setItem('arcane-duel-challenges', JSON.stringify(data.challenges));
      $('set-save-status').textContent = 'Save imported — reloading…';
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      $('set-save-status').textContent = 'Import failed: invalid save file (' + err.message + ') — nothing was changed.';
    }
  };
  reader.readAsText(file);
};
$('set-music').oninput = e => audio.setMusic(+e.target.value);
$('set-sfx').oninput = e => audio.setSfx(+e.target.value);
$('set-mute').onchange = e => audio.setMuted(e.target.checked);
$('set-touch-scale').oninput = e => { game.setTouchSettings(+e.target.value, undefined); $('set-touch-scale-val').textContent = (+e.target.value).toFixed(2) + '×'; };
$('set-touch-opacity').oninput = e => { game.setTouchSettings(undefined, +e.target.value); $('set-touch-opacity-val').textContent = Math.round(+e.target.value * 100) + '%'; };
$('set-back').onclick = () => show('ov-menu');

// ------------------------------------------------------------ pause / game over
function togglePause() {
  if (game.state === 'combat') { game.state = 'pause'; show('ov-pause'); }
  else if (game.state === 'pause') { game.state = 'combat'; show(null); }
}
$('pause-resume').onclick = () => { audio.click(); togglePause(); };
$('pause-restart').onclick = () => { audio.click(); if (lastBattleOpts) launchBattle(lastBattleOpts); };
$('pause-quit').onclick = () => { audio.click(); toMenu(); };
$('pause-fullscreen').onclick = () => { audio.click(); toggleFullscreen(); };
// Android v2 Tahap B — leaving the tab mid-combat auto-pauses (the 15s
// timer is already frozen while paused, so this stops it running while the
// tab is hidden). Input release on hide already lives in input.js.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'combat') togglePause();
});

game.ui.onGameOver = (r) => {
  const isCampaignFinal = r.mode === 'campaign' && r.won && r.campaignIndex >= CAMPAIGN.length - 1;
  let title, nextVisible = false, nextText = 'Next Battle';
  if (r.mode === 'survival') {
    // Android v2 Tahap B — each wave won pays +25 coins (see stats line);
    // losing ends the run, best wave is already saved by the game.
    if (r.won) { title = `🌊 WAVE ${r.survivalWave} CLEARED!`; nextVisible = true; nextText = '🌊 Next Wave →'; }
    else title = '💀 The waves overwhelm you...';
  } else if (r.mode === 'challenge') {
    // Android v2 Tahap B — the challenge verdict, not just the duel result.
    const c = CHALLENGES[r.challengeId];
    if (r.challengeResult === 'complete') title = `🏆 ${c.name.toUpperCase()} COMPLETE!`;
    else if (!r.won) title = '💀 Defeat...';
    else title = `❌ ${c.name} Failed`;
  } else {
    title = r.mode === 'campaign'
      ? (r.won ? (isCampaignFinal ? '🏆 CAMPAIGN COMPLETE!' : `🏆 ${r.winnerHero.name} Wins the Battle!`) : '💀 Defeat...')
      : (r.mode === 'training' ? 'Training Complete!' : `🏆 ${r.winnerName} Wins!`);
    nextVisible = r.mode === 'campaign' && r.won && !isCampaignFinal;
    const nextBattle = r.mode === 'campaign' && r.won && !isCampaignFinal ? CAMPAIGN[r.campaignIndex + 1] : null;
    nextText = nextBattle && nextBattle.elite ? '⚔ FINAL BOSS →' : 'Next Battle';
  }
  $('over-title').textContent = title;
  $('over-stats').innerHTML =
    `<p class="statline">Winner: <b>${r.winnerName}</b> (${r.winnerHero.name} — ${r.winnerHero.title})</p>` +
    `<p class="statline">Turns played: ${r.stats.turns} • Damage dealt: P1 ${r.stats.damage[0]} / P2 ${r.stats.damage[1]}</p>` +
    `<p class="statline">Elemental combos triggered: ${r.stats.combos}</p>` +
    `<p class="statline">🪙 Coins earned this battle: ${game.battleCoins} (total: ${game.coins})</p>` +
    (r.mode === 'campaign' && r.won && !isCampaignFinal ? `<p class="statline">Battle ${r.campaignIndex + 1} of ${CAMPAIGN.length} cleared — the next foe is stronger!</p>` : '') +
    (r.mode === 'campaign' && r.won && !isCampaignFinal && CAMPAIGN[r.campaignIndex + 1].elite ? `<p class="statline">⚔ Next: FINAL BOSS — Elite Bront, 150 HP!</p>` : '') +
    (r.mode === 'survival' ? `<p class="statline">🌊 Reached Wave ${r.survivalWave} • Best: Wave ${r.survivalBest} • +25 🪙 per wave cleared</p>` : '') +
    (r.mode === 'challenge' && r.challengeResult === 'complete' ? `<p class="statline">🏆 Challenge complete! +50 🪙</p>` : '') +
    (r.mode === 'challenge' && r.challengeResult === 'failed' ? `<p class="statline">❌ Failed: ${r.challengeFailReason || 'the challenge condition was not met'}</p>` : '');
  $('over-next').classList.toggle('hidden', !nextVisible);
  $('over-next').textContent = nextText;
  $('over-again').textContent = r.mode === 'campaign' ? 'Retry This Battle' : r.mode === 'survival' ? 'Restart Run (Wave 1)' : 'Play Again';
  // Android v2 Tahap B — campaign progress: a win unlocks the next battle
  // (saved for Continue); finishing the campaign clears the save.
  if (r.mode === 'campaign' && r.won && !isCampaignFinal) saveProgress(r.campaignIndex + 1, game.campaignHero || 'kairo', CAMPAIGN[r.campaignIndex + 1].diff);
  if (r.mode === 'campaign' && r.won && isCampaignFinal) clearProgress();
  show('ov-over');
  status($('over-title').textContent);
};
$('over-next').onclick = () => {
  audio.click();
  // Android v2 Tahap B — survival advances to the next wave; campaign to the next battle.
  if (game.mode === 'survival') { launchSurvival(game.survivalHero || 'kairo', game.survivalWave + 1); return; }
  launchCampaignBattle(game.campaignIndex + 1, game.campaignHero || 'kairo');
};
$('over-again').onclick = () => {
  audio.click();
  // Android v2 Tahap B — survival "Play Again" restarts the whole run at
  // Wave 1 (retrying the wave you died on would skip the run structure).
  if (game.mode === 'survival') { launchSurvival(game.survivalHero || 'kairo', 1); return; }
  if (lastBattleOpts) launchBattle(lastBattleOpts);
};
$('over-menu').onclick = () => { audio.click(); toMenu(); };
$('over-shop').onclick = () => { audio.click(); renderShop(); show('ov-shop'); }; // v3 — shop between battles

function toMenu() {
  game.state = 'menu';
  game.startDemo();
  $('menu-coins').textContent = `🪙 ${game.coins} Duel Coins`;
  refreshMenuButtons(); // Android v2 Tahap B — Continue / survival best
  show('ov-menu');
}

// ------------------------------------------------------------ input + loop
// v3 — touch mode: real touch devices get the big FIRE button + D-pad.
game.touchMode = ('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
new Input(canvas, game, renderer, togglePause);
let last = performance.now();
let fpsEma = 60; // Android v2 Tahap B — coarse FPS (EMA of rAF deltas).
function loop(now) {
  const rawDt = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, rawDt);
  if (rawDt > 0) fpsEma = fpsEma * 0.95 + (1 / Math.max(rawDt, 0.001)) * 0.05;
  game.fps = fpsEma;
  // The loop must never die: a single throw used to freeze the whole game
  // (Nov 2026 — a NaN projectile killed the rAF chain). Log and carry on.
  try { game.update(dt); renderer.draw(game, now / 1000); }
  catch (err) { console.error('[loop] recovered from error:', err); }
  requestAnimationFrame(loop);
}

// Android v2 Tahap B — PWA: register the service worker only on a safe
// origin (https / localhost). A failed registration must never break the
// first load, so the whole thing is guarded; the game works without it.
window.__swRegistered = false;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      window.__swRegistered = true;
      console.log('[sw] registered', reg.scope);
    }).catch(err => { window.__swRegistered = false; console.warn('[sw] registration failed:', err); });
  });
}

// Demo backdrop behind the menu (a quiet versus scene).
game.startDemo = function () {
  this.startBattle({ mode: 'versus', arena: 'valley', p1Hero: 'kairo', p2Hero: 'nyx', p2AI: null, seed: 11 });
  this.state = 'menu'; this.phase = 'aim'; this.banner = null;
};

// ------------------------------------------------------------ boot + shot staging
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = parseInt(params.get('seed') || '7', 10);
// Android v2 Tahap B — ?fps=1 shows the coarse FPS readout (Training or anywhere).
game.showFps = params.get('fps') === '1';

loadAssets().then(() => {
  refreshMenuButtons(); // Android v2 Tahap B — Continue Campaign if a save exists
  if (shot === 'select') { game.startDemo(); openSelect('versus'); }
  else if (shot === 'combat') {
    game.campaignDiff = 'normal';
    launchBattle({ mode: 'versus', arena: 'canyon', p1Hero: 'kairo', p2Hero: 'nyx', p2AI: null, seed });
    game.setAim(62, 100); // v3 — power 100 so the shot shows POW flames + the POW FIRE button
    // v2 staging: show a set reflect trap in the combat shot.
    game.players[0].energy = 100;
    game.placeTrap();
  } else if (shot === 'ultimate') {
    game.campaignDiff = 'normal';
    launchBattle({ mode: 'versus', arena: 'canyon', p1Hero: 'kairo', p2Hero: 'nyx', p2AI: null, seed });
    game.players[0].energy = 100;
    setTimeout(() => { game.useSkill(3); }, 350);
    setTimeout(() => { window.__shotReady = true; }, 4300);
    requestAnimationFrame(loop);
    return;
  } else if (shot === 'victory') {
    game.campaignDiff = 'normal';
    launchBattle({ mode: 'versus', arena: 'temple', p1Hero: 'kairo', p2Hero: 'nyx', p2AI: null, seed });
    setTimeout(() => {
      game.players[1].hp = 1;
      game._damagePlayer(1, 50, 1568, 400, 'fire');
      setTimeout(() => { game.nextTurn(); window.__shotReady = true; }, 400);
    }, 400);
    requestAnimationFrame(loop);
    return;
  } else {
    game.startDemo();
  }
  if (shot) window.__shotReady = true;
  requestAnimationFrame(loop);
});
