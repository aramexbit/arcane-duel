// ARCANE DUEL — service worker (Android v2 Tahap B). Cache-first for every
// game asset so the game works fully offline after the first load.
// Bump CACHE_NAME on every deploy so updates reach players.
const CACHE_NAME = 'arcane-duel-v4';
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/audio.js",
  "./src/config.js",
  "./src/engine.js",
  "./src/game.js",
  "./src/input.js",
  "./src/main.js",
  "./src/render.js",
  "./assets/arcane_zone.png",
  "./assets/bront_aim.png",
  "./assets/bront_defeat.png",
  "./assets/bront_fire.png",
  "./assets/bront_hit.png",
  "./assets/bront_idle_0.png",
  "./assets/bront_idle_1.png",
  "./assets/bront_victory.png",
  "./assets/decor_barrel.png",
  "./assets/decor_cloud.png",
  "./assets/decor_crate.png",
  "./assets/decor_crystal_blue.png",
  "./assets/decor_crystal_gold.png",
  "./assets/decor_crystal_pink.png",
  "./assets/decor_flower.png",
  "./assets/decor_grass.png",
  "./assets/decor_moon.png",
  "./assets/decor_pillar.png",
  "./assets/decor_torch.png",
  "./assets/expl_0.png",
  "./assets/expl_1.png",
  "./assets/expl_2.png",
  "./assets/kairo_aim.png",
  "./assets/kairo_defeat.png",
  "./assets/kairo_fire.png",
  "./assets/kairo_hit.png",
  "./assets/kairo_idle_0.png",
  "./assets/kairo_idle_1.png",
  "./assets/kairo_victory.png",
  "./assets/kumbang_aim.png",
  "./assets/kumbang_defeat.png",
  "./assets/kumbang_fire.png",
  "./assets/kumbang_hit.png",
  "./assets/kumbang_idle_0.png",
  "./assets/kumbang_idle_1.png",
  "./assets/kumbang_victory.png",
  "./assets/momok_aim.png",
  "./assets/momok_defeat.png",
  "./assets/momok_fire.png",
  "./assets/momok_hit.png",
  "./assets/momok_idle_0.png",
  "./assets/momok_idle_1.png",
  "./assets/momok_victory.png",
  "./assets/nyx_aim.png",
  "./assets/nyx_defeat.png",
  "./assets/nyx_fire.png",
  "./assets/nyx_hit.png",
  "./assets/nyx_idle_0.png",
  "./assets/nyx_idle_1.png",
  "./assets/nyx_victory.png",
  "./assets/portrait_bront.png",
  "./assets/portrait_kairo.png",
  "./assets/portrait_kumbang.png",
  "./assets/portrait_momok.png",
  "./assets/portrait_nyx.png",
  "./assets/portrait_tawon.png",
  "./assets/proj_astral.png",
  "./assets/proj_beam.png",
  "./assets/proj_boulder.png",
  "./assets/proj_cannon.png",
  "./assets/proj_cluster.png",
  "./assets/proj_fire.png",
  "./assets/proj_homing.png",
  "./assets/proj_meteor.png",
  "./assets/proj_moon.png",
  "./assets/proj_pierce.png",
  "./assets/proj_shield.png",
  "./assets/spark.png",
  "./assets/tawon_aim.png",
  "./assets/tawon_defeat.png",
  "./assets/tawon_fire.png",
  "./assets/tawon_hit.png",
  "./assets/tawon_idle_0.png",
  "./assets/tawon_idle_1.png",
  "./assets/tawon_victory.png",
  "./assets/trap_totem.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
