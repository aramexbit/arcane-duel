// ARCANE DUEL — bootstrap, DOM menus, main loop, screenshot staging.
import { Game } from './game.js';
import { Renderer, loadAssets } from './render.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { HEROES, ARENAS, ARENA_ORDER, DIFFICULTY, WEAPONS, WEAPON_ORDER, SHOP_PRICES, FREE_WEAPONS } from './config.js';

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
const overlays = ['ov-menu', 'ov-select', 'ov-pause', 'ov-over', 'ov-settings', 'ov-credits', 'ov-howto', 'ov-shop'];
function show(id) {
  for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
  if (!id) for (const o of overlays) $(o).classList.add('hidden');
}
function status(msg) { $('status').textContent = msg; }

// ------------------------------------------------------------ select flow
const sel = { mode: null, step: 1, p1: 'kairo', p2: 'nyx', arena: 'valley', diff: 'normal' };
let lastBattleOpts = null;

function renderSelect() {
  const cards = $('sel-cards');
  cards.innerHTML = '';
  const stepHero = sel.step === 1 ? 'p1' : 'p2';
  $('sel-title').textContent = sel.mode === 'versus'
    ? (sel.step === 1 ? 'Player 1 — Choose Your Warrior' : 'Player 2 — Choose Your Warrior')
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
  show(null);
  status(`Battle started in ${ARENAS[opts.arena].name}`);
}

$('sel-start').onclick = () => {
  audio.ensure(); audio.click();
  if (sel.mode === 'versus' && sel.step === 1) { sel.step = 2; renderSelect(); return; }
  if (sel.mode === 'campaign') {
    launchBattle({ mode: 'campaign', arena: CAMPAIGN[0].arena, p1Hero: sel.p1, p2Hero: CAMPAIGN[0].ai, p2AI: CAMPAIGN[0].diff, campaignIndex: 0, campaignTotal: CAMPAIGN.length });
    game.campaignDiff = CAMPAIGN[0].diff;
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
    if (act === 'campaign' || act === 'versus' || act === 'training') openSelect(act);
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
}
$('set-music').oninput = e => audio.setMusic(+e.target.value);
$('set-sfx').oninput = e => audio.setSfx(+e.target.value);
$('set-mute').onchange = e => audio.setMuted(e.target.checked);
$('set-back').onclick = () => show('ov-menu');

// ------------------------------------------------------------ pause / game over
function togglePause() {
  if (game.state === 'combat') { game.state = 'pause'; show('ov-pause'); }
  else if (game.state === 'pause') { game.state = 'combat'; show(null); }
}
$('pause-resume').onclick = () => { audio.click(); togglePause(); };
$('pause-restart').onclick = () => { audio.click(); if (lastBattleOpts) launchBattle(lastBattleOpts); };
$('pause-quit').onclick = () => { audio.click(); toMenu(); };

game.ui.onGameOver = (r) => {
  const isCampaignFinal = r.mode === 'campaign' && r.won && r.campaignIndex >= CAMPAIGN.length - 1;
  $('over-title').textContent = r.mode === 'campaign'
    ? (r.won ? (isCampaignFinal ? '🏆 CAMPAIGN COMPLETE!' : `🏆 ${r.winnerHero.name} Wins the Battle!`) : '💀 Defeat...')
    : (r.mode === 'training' ? 'Training Complete!' : `🏆 ${r.winnerName} Wins!`);
  $('over-stats').innerHTML =
    `<p class="statline">Winner: <b>${r.winnerName}</b> (${r.winnerHero.name} — ${r.winnerHero.title})</p>` +
    `<p class="statline">Turns played: ${r.stats.turns} • Damage dealt: P1 ${r.stats.damage[0]} / P2 ${r.stats.damage[1]}</p>` +
    `<p class="statline">Elemental combos triggered: ${r.stats.combos}</p>` +
    `<p class="statline">🪙 Coins earned this battle: ${game.battleCoins} (total: ${game.coins})</p>` +
    (r.mode === 'campaign' && r.won && !isCampaignFinal ? `<p class="statline">Battle ${r.campaignIndex + 1} of ${CAMPAIGN.length} cleared — the next foe is stronger!</p>` : '') +
    (r.mode === 'campaign' && r.won && !isCampaignFinal && CAMPAIGN[r.campaignIndex + 1].elite ? `<p class="statline">⚔ Next: FINAL BOSS — Elite Bront, 150 HP!</p>` : '');
  $('over-next').classList.toggle('hidden', !(r.mode === 'campaign' && r.won && !isCampaignFinal));
  const nextBattle = r.mode === 'campaign' && r.won && !isCampaignFinal ? CAMPAIGN[r.campaignIndex + 1] : null;
  $('over-next').textContent = nextBattle && nextBattle.elite ? '⚔ FINAL BOSS →' : 'Next Battle';
  $('over-again').textContent = r.mode === 'campaign' ? 'Retry This Battle' : 'Play Again';
  show('ov-over');
  status($('over-title').textContent);
};
$('over-next').onclick = () => {
  audio.click();
  const next = CAMPAIGN[game.campaignIndex + 1];
  const opts = { mode: 'campaign', arena: next.arena, p1Hero: game.campaignHero || 'kairo', p2Hero: next.ai, p2AI: next.diff, campaignIndex: game.campaignIndex + 1, elite: !!next.elite, campaignTotal: CAMPAIGN.length };
  game.campaignDiff = next.diff;
  launchBattle(opts);
};
$('over-again').onclick = () => { audio.click(); if (lastBattleOpts) launchBattle(lastBattleOpts); };
$('over-menu').onclick = () => { audio.click(); toMenu(); };
$('over-shop').onclick = () => { audio.click(); renderShop(); show('ov-shop'); }; // v3 — shop between battles

function toMenu() {
  game.state = 'menu';
  game.startDemo();
  $('menu-coins').textContent = `🪙 ${game.coins} Duel Coins`;
  show('ov-menu');
}

// ------------------------------------------------------------ input + loop
// v3 — touch mode: real touch devices get the big FIRE button + D-pad.
game.touchMode = ('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
new Input(canvas, game, renderer, togglePause);
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // The loop must never die: a single throw used to freeze the whole game
  // (Nov 2026 — a NaN projectile killed the rAF chain). Log and carry on.
  try { game.update(dt); renderer.draw(game, now / 1000); }
  catch (err) { console.error('[loop] recovered from error:', err); }
  requestAnimationFrame(loop);
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

loadAssets().then(() => {
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
