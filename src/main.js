// ARCANE DUEL — bootstrap, DOM menus, main loop, screenshot staging.
import { Game } from './game.js';
import { Renderer, loadAssets } from './render.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { HEROES, ARENAS, ARENA_ORDER, DIFFICULTY, WEAPONS, WEAPON_ORDER, SHOP_PRICES, FREE_WEAPONS, CHALLENGES, CHALLENGE_ORDER, QUALITY, SKINS, SKIN_WEAPONS, SKIN_WEAPON_NAMES, SKIN_RARITY_COLORS, SKIN_RARITY_ORDER, SKIN_THEMES, FEATURED_DISCOUNT, featuredSkin, currentWeekId, featuredTimeLeft } from './config.js';

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
const overlays = ['ov-menu', 'ov-select', 'ov-pause', 'ov-over', 'ov-settings', 'ov-credits', 'ov-howto', 'ov-shop', 'ov-challenge', 'ov-collection'];
function show(id) {
  for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
  if (!id) for (const o of overlays) $(o).classList.add('hidden');
  // v3.1 Skin Feature — leaving the shop / collection stops the preview
  // animation + sound (a hidden canvas must not keep playing).
  if (id !== 'ov-shop' && id !== 'ov-collection') stopSkinPreview();
}
// v3.1 Skin Feature — shared preview state (probe reads this). Declared
// here, before any show() call can reach stopSkinPreview().
let previewAnim = null;
window.__skinPreview = { running: false, skinId: null, weaponId: null, frames: 0 };
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
function refreshMenuCoins() { $('menu-coins').textContent = `🪙 ${game.coins} Duel Coins • 💎 ${game.gems} Gems • 🔥 Streak ×${game.streak}`; }
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

// ------------------------------------------------------------ v3.1 Skin Feature + R1/R2: skin shop, Featured, collection
// Shop tabs: Weapons (coins) | Featured (weekly discounted skin) | Weapon
// Skins (Gems). Pets / Equipment / Special Offers are NOT built — no systems
// behind them, so an empty category button would be a placeholder, which the
// spec forbids. Featured IS real content: one skin, rotating weekly by week
// number, at FEATURED_DISCOUNT off — never a placeholder.
function updateShopGems() {
  $('shop-gems').textContent = `💎 ${game.gems} Gems • 🔥 Win streak ×${game.streak} — earn Gems from damage, hits, wins and streaks`;
}

function stopSkinPreview() {
  if (previewAnim) cancelAnimationFrame(previewAnim);
  previewAnim = null;
  window.__skinPreview.running = false;
  window.__skinPreview.skinId = null;
}

// Shared Full Power preview: a looping 2.8 s animation on any canvas —
// projectile flies, themed Full Power explosion, sound plays automatically.
// No external assets: everything is drawn + synthesised (audio.js).
const PREVIEW_EMOJI = { dragon: '🐉', ice: '❄️', thunder: '⚡', gold: '✨', dark: '🌑', toxic: '☠️', holy: '😇', shadow: '👁️', cyber: '🤖', plasma: '💗', matter: '🕳️', lava: '🌋', default: '💥' };
const PREVIEW_STARS = Array.from({ length: 24 }, () => ({ x: Math.random() * 320, y: Math.random() * 90 }));
function startSkinPreview(skin, canvasEl, infoEl) {
  stopSkinPreview();
  if (!skin || !canvasEl) return;
  audio.ensure();
  const theme = SKIN_THEMES[skin.theme] || SKIN_THEMES.default;
  const c2 = canvasEl.getContext('2d');
  const W2 = canvasEl.width, H2 = canvasEl.height;
  const label = `${PREVIEW_EMOJI[skin.theme] || '💥'} ${skin.name.toUpperCase()} — FULL POWER!`;
  const start = performance.now();
  let lastT = 0, soundPlayed = false, boomPlayed = false, trail = [], parts = [];
  window.__skinPreview.skinId = skin.id;
  window.__skinPreview.weaponId = skin.weaponId || null;
  window.__skinPreview.running = true;
  if (infoEl) infoEl.textContent = `${skin.name} — ${skin.rarity} • ${skin.desc}`;
  function tick(now) {
    const t = ((now - start) / 1000) % 2.8;
    window.__skinPreview.frames++;
    if (t < lastT) { soundPlayed = false; boomPlayed = false; trail = []; parts = []; }
    lastT = t;
    const g = c2.createLinearGradient(0, 0, 0, H2);
    g.addColorStop(0, '#0b0e1e'); g.addColorStop(1, '#1a2340');
    c2.fillStyle = g; c2.fillRect(0, 0, W2, H2);
    c2.fillStyle = 'rgba(255,255,255,0.7)';
    for (const s of PREVIEW_STARS) c2.fillRect(s.x, s.y, 1.5, 1.5);
    c2.fillStyle = '#2a3b2a'; c2.fillRect(0, H2 - 22, W2, 22);
    c2.fillStyle = '#3a5238'; c2.fillRect(0, H2 - 22, W2, 3);
    // launcher (left) + target dummy (right)
    c2.save(); c2.translate(34, H2 - 26); c2.rotate(-0.9);
    c2.fillStyle = '#3a3f4a'; c2.fillRect(-4, -26, 9, 30);
    c2.fillStyle = theme.proj; c2.fillRect(-4, -30, 9, 5);
    c2.restore();
    c2.fillStyle = '#8a6d4b'; c2.beginPath(); c2.arc(252, H2 - 34, 9, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = '#fff'; c2.fillRect(248, H2 - 42, 3, 3); c2.fillRect(254, H2 - 42, 3, 3);
    if (t < 1.1) {
      const k = t / 1.1;
      const x = 34 + k * 218, y = (H2 - 26) - Math.sin(k * Math.PI) * 62;
      trail.push({ x, y }); if (trail.length > 14) trail.shift();
      for (let i = 0; i < trail.length; i++) {
        c2.globalAlpha = (i / trail.length) * 0.6;
        c2.fillStyle = theme.trail; c2.beginPath(); c2.arc(trail[i].x, trail[i].y, 3 + i * 0.3, 0, Math.PI * 2); c2.fill();
      }
      c2.globalAlpha = 1;
      c2.fillStyle = theme.glow; c2.beginPath(); c2.arc(x, y, 9, 0, Math.PI * 2); c2.fill();
      c2.fillStyle = theme.proj; c2.beginPath(); c2.arc(x, y, 5, 0, Math.PI * 2); c2.fill();
      if (!soundPlayed) { audio.skinFullPower(skin.theme); soundPlayed = true; }
    } else {
      const et = t - 1.1;
      if (!boomPlayed) {
        audio.skinBoom(skin.theme, true);
        boomPlayed = true;
        parts = Array.from({ length: 26 }, () => {
          const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
          return { x: 252, y: H2 - 34, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, r: 2 + Math.random() * 4 };
        });
      }
      const R = Math.min(70, et * 90);
      c2.globalAlpha = Math.max(0, 1 - et / 0.9);
      c2.strokeStyle = theme.boom; c2.lineWidth = 4;
      c2.beginPath(); c2.arc(252, H2 - 34, R, 0, Math.PI * 2); c2.stroke();
      c2.fillStyle = theme.boom;
      for (const p of parts) {
        const px = p.x + p.vx * et, py = p.y + p.vy * et + 30 * et * et;
        c2.globalAlpha = Math.max(0, 1 - et / 0.9);
        c2.beginPath(); c2.arc(px, py, p.r, 0, Math.PI * 2); c2.fill();
      }
      c2.globalAlpha = 1;
      c2.fillStyle = theme.glow; c2.font = 'bold 15px sans-serif'; c2.textAlign = 'center';
      c2.fillText(label, W2 / 2, 30);
    }
    previewAnim = requestAnimationFrame(tick);
  }
  previewAnim = requestAnimationFrame(tick);
}

function sortSkins(list, sort) {
  const arr = list.slice();
  if (sort === 'price') arr.sort((a, b) => a.price - b.price);
  else if (sort === 'newest') arr.reverse();
  else arr.sort((a, b) => (SKIN_RARITY_ORDER[a.rarity] - SKIN_RARITY_ORDER[b.rarity]) || (a.price - b.price));
  return arr;
}

// One skin row, shared by the shop and the collection. `ctx` decides the
// action buttons (shop: Buy/Equip; collection: Equip or "Buy in Shop").
function skinRow(parent, weaponId, skin, ctx) {
  const owned = game.ownsSkin(weaponId, skin.id);
  const equipped = game.skinEquipped[weaponId] === skin.id;
  const row = document.createElement('div');
  row.className = 'pickrow';
  row.style.cssText = 'justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;margin:6px 0;text-align:left;cursor:pointer;';
  const left = document.createElement('div');
  left.innerHTML = `<b>${skin.name}</b> <span style="color:${SKIN_RARITY_COLORS[skin.rarity]};font-size:12px;font-weight:bold">${skin.rarity.toUpperCase()}</span> <span style="color:#bbb;font-size:13px">${skin.desc}</span>` +
    (equipped ? ' <span style="color:#58d158">✓ EQUIPPED</span>' : owned ? ' <span style="color:#58d158">✓ OWNED</span>' : '');
  row.appendChild(left);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
  const mkBtn = (text, disabled, fn) => {
    const b = document.createElement('button');
    b.className = 'pick';
    b.textContent = text; b.disabled = !!disabled;
    b.style.opacity = b.disabled ? 0.55 : 1;
    b.onclick = (e) => { e.stopPropagation(); audio.ensure(); fn(); };
    btns.appendChild(b);
    return b;
  };
  if (ctx === 'shop') {
    if (!owned && skin.price > 0) {
      mkBtn(`Buy — ${skin.price} 💎`, game.gems < skin.price, () => {
        if (!window.confirm(`Buy ${skin.name} for ${skin.price} 💎 Gems? Skins are cosmetic only.`)) return;
        if (game.buySkin(weaponId, skin.id)) { audio.click(); renderSkinShop(); }
      });
    } else if (owned && !equipped) {
      mkBtn('Equip', false, () => { if (game.equipSkin(weaponId, skin.id)) renderSkinShop(); });
    } else if (equipped) {
      mkBtn('Unequip', false, () => { game.unequipSkin(weaponId); renderSkinShop(); });
    }
  } else {
    if (owned && !equipped) mkBtn('Equip', false, () => { if (game.equipSkin(weaponId, skin.id)) renderCollection(); });
    else if (equipped) mkBtn('Unequip', false, () => { game.unequipSkin(weaponId); renderCollection(); });
    else mkBtn('🛒 Buy in Shop', false, () => { skinShop.weapon = weaponId; skinShop.selected = skin.id; switchShopTab('skins'); show('ov-shop'); });
  }
  row.appendChild(btns);
  row.onclick = () => {
    audio.ensure();
    if (ctx === 'shop') { skinShop.selected = skin.id; startSkinPreview({ ...skin, weaponId }, $('skin-preview'), $('skin-preview-info')); }
    else { collection.selected = skin.id; startSkinPreview({ ...skin, weaponId }, $('collection-preview'), $('collection-preview-info')); }
  };
  parent.appendChild(row);
  return row;
}

// --- Weapon Skins tab (Gems) ---
const skinShop = { weapon: 'cannon', filter: 'All', sort: 'rarity', selected: null };
window.__skinShop = skinShop;
function renderSkinShop() {
  updateShopGems();
  const wRow = $('shop-skin-weapons'); wRow.innerHTML = '';
  for (const w of SKIN_WEAPONS) {
    const b = document.createElement('button');
    b.className = 'pick' + (skinShop.weapon === w ? ' sel' : '');
    b.textContent = SKIN_WEAPON_NAMES[w];
    b.onclick = () => { audio.ensure(); audio.click(); skinShop.weapon = w; skinShop.selected = null; stopSkinPreview(); renderSkinShop(); };
    wRow.appendChild(b);
  }
  const fRow = $('shop-skin-filters'); fRow.innerHTML = '';
  for (const f of ['All', 'Common', 'Rare', 'Epic', 'Legendary']) {
    const b = document.createElement('button');
    b.className = 'pick' + (skinShop.filter === f ? ' sel' : '');
    b.textContent = f;
    b.onclick = () => { audio.click(); skinShop.filter = f; renderSkinShop(); };
    fRow.appendChild(b);
  }
  for (const [s, label] of [['rarity', 'Sort: Rarity'], ['price', 'Sort: Price'], ['newest', 'Sort: Newest']]) {
    const b = document.createElement('button');
    b.className = 'pick' + (skinShop.sort === s ? ' sel' : '');
    b.textContent = label;
    b.onclick = () => { audio.click(); skinShop.sort = s; renderSkinShop(); };
    fRow.appendChild(b);
  }
  const list = $('shop-skin-list'); list.innerHTML = '';
  let skins = SKINS[skinShop.weapon] || [];
  if (skinShop.filter !== 'All') skins = skins.filter(s => s.rarity === skinShop.filter);
  skins = sortSkins(skins, skinShop.sort);
  if (skins.length === 0) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:13px;color:#bbb;margin:8px 0;';
    note.textContent = `No ${skinShop.filter} skins for ${SKIN_WEAPON_NAMES[skinShop.weapon]} yet — new skins will appear here when they drop.`;
    list.appendChild(note);
    stopSkinPreview();
    $('skin-preview-info').textContent = 'No skins match this filter.';
    return;
  }
  for (const s of skins) skinRow(list, skinShop.weapon, s, 'shop');
  const selId = skinShop.selected && skins.some(s => s.id === skinShop.selected) ? skinShop.selected : skins[0].id;
  skinShop.selected = selId;
  const sel = skins.find(s => s.id === selId);
  startSkinPreview({ ...sel, weaponId: skinShop.weapon }, $('skin-preview'), $('skin-preview-info'));
}

// --- Featured tab (R2): one skin per week, deterministic, discounted ---
function renderFeatured() {
  updateShopGems();
  const f = featuredSkin(currentWeekId());
  window.__featuredSkin = f;
  const tl = featuredTimeLeft();
  const owned = game.ownsSkin(f.weaponId, f.id);
  const equipped = game.skinEquipped[f.weaponId] === f.id;
  const content = $('featured-content');
  content.innerHTML = '';
  const head = document.createElement('div');
  head.style.cssText = 'background:rgba(255,215,106,0.10);border:1px solid #ffd76a;border-radius:10px;padding:10px 12px;margin:6px 0;text-align:left;';
  head.innerHTML = `<b style="font-size:17px">⭐ ${f.name}</b> <span style="color:${SKIN_RARITY_COLORS[f.rarity]};font-size:12px;font-weight:bold">${f.rarity.toUpperCase()}</span><br>` +
    `<span style="color:#bbb;font-size:13px">${SKIN_WEAPON_NAMES[f.weaponId]} • ${f.desc}</span><br>` +
    `<span style="color:#888;text-decoration:line-through;font-size:14px">${f.originalPrice} 💎</span> <b style="color:#50dcf0;font-size:17px">${f.price} 💎</b> <span style="color:#58d158;font-size:13px">−${Math.round(FEATURED_DISCOUNT * 100)}% this week!</span><br>` +
    `<span style="color:#bbb;font-size:13px">⏰ Rotates in ${tl.days}d ${tl.hours}h — a new featured skin every week.</span>` +
    (equipped ? ' <span style="color:#58d158">✓ EQUIPPED</span>' : owned ? ' <span style="color:#58d158">✓ OWNED</span>' : '');
  content.appendChild(head);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const mkBtn = (text, disabled, fn) => {
    const b = document.createElement('button');
    b.className = 'pick'; b.textContent = text; b.disabled = !!disabled;
    b.style.opacity = b.disabled ? 0.55 : 1;
    b.onclick = () => { audio.ensure(); fn(); };
    btns.appendChild(b);
  };
  if (!owned) mkBtn(`Buy — ${f.price} 💎`, game.gems < f.price, () => {
    if (!window.confirm(`Buy ${f.name} (Featured, ${Math.round(FEATURED_DISCOUNT * 100)}% off) for ${f.price} 💎 Gems? Skins are cosmetic only.`)) return;
    if (game.buySkin(f.weaponId, f.id, f.price)) { audio.click(); renderFeatured(); }
  });
  else if (!equipped) mkBtn('Equip', false, () => { if (game.equipSkin(f.weaponId, f.id)) renderFeatured(); });
  else mkBtn('Unequip', false, () => { game.unequipSkin(f.weaponId); renderFeatured(); });
  content.appendChild(btns);
  // Auto-preview on open: see the explosion + hear the sound before buying.
  startSkinPreview(f, $('featured-preview'), $('featured-preview-info'));
}

let shopTab = 'weapons';
function switchShopTab(tab) {
  shopTab = tab;
  $('shop-tab-weapons').classList.toggle('sel', tab === 'weapons');
  $('shop-tab-featured').classList.toggle('sel', tab === 'featured');
  $('shop-tab-skins').classList.toggle('sel', tab === 'skins');
  $('shop-list').classList.toggle('hidden', tab !== 'weapons');
  $('shop-featured').classList.toggle('hidden', tab !== 'featured');
  $('shop-skins').classList.toggle('hidden', tab !== 'skins');
  if (tab === 'featured') renderFeatured();
  else if (tab === 'skins') renderSkinShop();
  else stopSkinPreview();
}
$('shop-tab-weapons').onclick = () => { audio.click(); switchShopTab('weapons'); };
$('shop-tab-featured').onclick = () => { audio.click(); switchShopTab('featured'); };
$('shop-tab-skins').onclick = () => { audio.click(); switchShopTab('skins'); };
$('skin-preview-sound').onclick = () => { audio.ensure(); const s = (SKINS[skinShop.weapon] || []).find(x => x.id === skinShop.selected); if (s) { audio.skinFullPower(s.theme); startSkinPreview({ ...s, weaponId: skinShop.weapon }, $('skin-preview'), $('skin-preview-info')); } };
$('featured-preview-sound').onclick = () => { audio.ensure(); const f = window.__featuredSkin; if (f) { audio.skinFullPower(f.theme); startSkinPreview(f, $('featured-preview'), $('featured-preview-info')); } };

// --- Skin Collection (R1): grid + rarity filter + sort + equip from the
// collection itself, not only from the shop. Unowned skins link to the shop.
const collection = { weapon: 'cannon', filter: 'All', sort: 'rarity', selected: null };
window.__collectionState = collection;
function renderCollection() {
  $('collection-gems').textContent = `💎 ${game.gems} Gems • 🔥 Win streak ×${game.streak}`;
  const wRow = $('collection-weapons'); wRow.innerHTML = '';
  for (const w of SKIN_WEAPONS) {
    const b = document.createElement('button');
    b.className = 'pick' + (collection.weapon === w ? ' sel' : '');
    b.textContent = SKIN_WEAPON_NAMES[w];
    b.onclick = () => { audio.ensure(); audio.click(); collection.weapon = w; collection.selected = null; stopSkinPreview(); renderCollection(); };
    wRow.appendChild(b);
  }
  const fRow = $('collection-filters'); fRow.innerHTML = '';
  for (const f of ['All', 'Common', 'Rare', 'Epic', 'Legendary']) {
    const b = document.createElement('button');
    b.className = 'pick' + (collection.filter === f ? ' sel' : '');
    b.textContent = f;
    b.onclick = () => { audio.click(); collection.filter = f; renderCollection(); };
    fRow.appendChild(b);
  }
  const sRow = $('collection-sort'); sRow.innerHTML = '';
  for (const [s, label] of [['rarity', 'Sort: Rarity'], ['price', 'Sort: Price'], ['newest', 'Sort: Newest']]) {
    const b = document.createElement('button');
    b.className = 'pick' + (collection.sort === s ? ' sel' : '');
    b.textContent = label;
    b.onclick = () => { audio.click(); collection.sort = s; renderCollection(); };
    sRow.appendChild(b);
  }
  const grid = $('collection-grid'); grid.innerHTML = '';
  const allForWeapon = SKINS[collection.weapon] || [];
  const ownedCount = allForWeapon.filter(s => game.ownsSkin(collection.weapon, s.id)).length;
  const head = document.createElement('div');
  head.style.cssText = 'font-size:13px;color:#bbb;margin:6px 0;';
  head.textContent = `${SKIN_WEAPON_NAMES[collection.weapon]} — owned ${ownedCount} of ${allForWeapon.length} skins`;
  grid.appendChild(head);
  let skins = allForWeapon;
  if (collection.filter !== 'All') skins = skins.filter(s => s.rarity === collection.filter);
  skins = sortSkins(skins, collection.sort);
  if (skins.length === 0) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:13px;color:#bbb;margin:8px 0;';
    note.textContent = `No ${collection.filter} skins for ${SKIN_WEAPON_NAMES[collection.weapon]} yet.`;
    grid.appendChild(note);
    stopSkinPreview();
    $('collection-preview-info').textContent = 'No skins match this filter.';
    return;
  }
  for (const s of skins) skinRow(grid, collection.weapon, s, 'collection');
  const selId = collection.selected && skins.some(s => s.id === collection.selected) ? collection.selected : skins[0].id;
  collection.selected = selId;
  const sel = skins.find(s => s.id === selId);
  startSkinPreview({ ...sel, weaponId: collection.weapon }, $('collection-preview'), $('collection-preview-info'));
}
$('collection-back').onclick = () => { audio.click(); show('ov-menu'); };
$('collection-preview-sound').onclick = () => { audio.ensure(); const s = (SKINS[collection.weapon] || []).find(x => x.id === collection.selected); if (s) { audio.skinFullPower(s.theme); startSkinPreview({ ...s, weaponId: collection.weapon }, $('collection-preview'), $('collection-preview-info')); } };

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
    else if (act === 'collection') { renderCollection(); show('ov-collection'); }
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
  // R4 — aim sensitivity (field inside arcane-duel-settings, default 1.0).
  $('set-aim-sens').value = game.aimSens;
  $('set-aim-sens-val').textContent = game.aimSens.toFixed(1) + '×';
}
document.querySelectorAll('#set-quality .pick').forEach(b => {
  b.onclick = () => { audio.ensure(); audio.click(); game.setQuality(b.dataset.q); syncSettings(); };
});
// Android v2 Tahap B — export / import save (all localStorage keys).
function collectSave() {
  return {
    version: 1, exportedAt: new Date().toISOString(),
    coins: game.coins, owned: [...game.owned],
    // v3.1 Skin Feature + R1: Gems, owned/equipped skins, win streak.
    gems: game.gems, skinsOwned: [...game.skinOwned], skinsEquipped: { ...game.skinEquipped }, streak: game.streak,
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
      // v3.1 Skin Feature + R1 — skins / Gems / streak (optional: old saves
      // without them still import fine).
      if (data.gems !== undefined && (typeof data.gems !== 'number' || data.gems < 0 || !Number.isFinite(data.gems))) throw new Error('bad gems');
      if (data.streak !== undefined && (typeof data.streak !== 'number' || data.streak < 0 || !Number.isFinite(data.streak))) throw new Error('bad streak');
      if (data.skinsOwned !== undefined && (!Array.isArray(data.skinsOwned) || data.skinsOwned.some(k => typeof k !== 'string' || !SKIN_WEAPONS.includes(k.split(':')[0]) || !(SKINS[k.split(':')[0]] || []).some(s => s.id === k.split(':')[1])))) throw new Error('bad skins owned');
      if (data.skinsEquipped !== undefined && (typeof data.skinsEquipped !== 'object' || data.skinsEquipped === null || Object.entries(data.skinsEquipped).some(([w, s]) => !SKIN_WEAPONS.includes(w) || !(SKINS[w] || []).some(x => x.id === s)))) throw new Error('bad skins equipped');
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
      if (data.gems !== undefined) localStorage.setItem('arcane-duel-gems', String(Math.floor(data.gems)));
      if (data.streak !== undefined) localStorage.setItem('arcane-duel-streak', String(Math.floor(data.streak)));
      if (data.skinsOwned !== undefined) localStorage.setItem('arcane-duel-skins-owned', JSON.stringify(data.skinsOwned));
      if (data.skinsEquipped !== undefined) localStorage.setItem('arcane-duel-skins-equipped', JSON.stringify(data.skinsEquipped));
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
// R4 — aim sensitivity: 0.5x = steady, 2.0x = twitchy. Applies to the AIM
// pad drag and to field/mouse drag aim (power build-up); keyboard arrows
// and Space charge keep their fixed steps.
$('set-aim-sens').oninput = e => { game.setAimSens(+e.target.value); $('set-aim-sens-val').textContent = game.aimSens.toFixed(1) + '×'; };
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
    (r.gemBreakdown ? `<p class="statline">💎 Gems earned: +${r.gemBreakdown.total} (total: ${game.gems}) — damage ${r.gemBreakdown.damage} → +${r.gemBreakdown.damageGems} 💎 • ${r.gemBreakdown.hits} hits → +${r.gemBreakdown.hitGems} 💎 • ${r.gemBreakdown.bonusLabel} +${r.gemBreakdown.bonus} 💎${r.gemBreakdown.won && r.gemBreakdown.streakGems > 0 ? ` • win streak ×${r.gemBreakdown.streak} +${r.gemBreakdown.streakGems} 💎` : ''}</p>` : '') +
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
  refreshMenuCoins();
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
  refreshMenuCoins(); // v3.1 — coins + Gems + streak on the menu
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
