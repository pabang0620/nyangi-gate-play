'use strict';
// Sprites and battlefield backgrounds from the generated images (img/*.png, listed in img/manifest.js;
// pipeline in art/tools). Sprites are stored at 2x their in-game size so they stay sharp on phones.
// A missing image never crashes the game: it is drawn as a neutral placeholder disc.

const Art = (() => {
    function canvas(w, hh) { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; }

    // white silhouette used for hit flashes
    function whiteOf(c) {
        const w = canvas(c.width, c.height), x = w.getContext('2d');
        x.drawImage(c, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = '#fff'; x.fillRect(0, 0, w.width, w.height);
        return w;
    }

    const loaded = {};
    function load() {
        const list = (typeof window !== 'undefined' && window.IMG_LIST) || [];
        return Promise.all(list.map(name => new Promise(res => {
            const im = new Image();
            im.onload = () => {
                const c = canvas(im.width, im.height);
                c.getContext('2d').drawImage(im, 0, 0);
                const k = /^(bg_|path_|title_bg|app_icon)/.test(name) ? 1 : (/^i_/.test(name) && im.width >= 200 ? 8 : 4);   // sprites are stored at 2x and drawn at scale 2
                loaded[name] = { img: c, white: whiteOf(c), w: im.width / k, h: im.height / k, hi: true };
                res();
            };
            im.onerror = () => res();
            im.src = 'img/' + name + '.png';
        })));
    }
    function gen(name) { return loaded[name] || null; }

    const placeholders = {};
    function placeholder(w, hh) {
        const key = w + 'x' + hh;
        if (placeholders[key]) return placeholders[key];
        const c = canvas(w * 2, hh * 2), x = c.getContext('2d');
        x.fillStyle = '#8a7a6a'; x.beginPath(); x.ellipse(w, hh, w * 0.8, hh * 0.8, 0, 0, TAU); x.fill();
        return (placeholders[key] = { img: c, white: whiteOf(c), w, h: hh, hi: true });
    }
    const sprite = (name, w, hh) => gen(name) || placeholder(w, hh);

    // f (walk frame) and skin are kept in the signatures for callers; generated art has one frame
    function enemy(kind) { const d = typeof ENEMIES !== 'undefined' && ENEMIES[kind]; const s = d ? d.size : 16; return sprite('e_' + kind, s * 1.4, s * 1.4); }
    function hero(cls) { return sprite('h_' + cls, 18, 22); }
    function soldier(kind) { return sprite('s_' + kind, 14, 17); }
    function tower(type, lv, spec) { return sprite('t_' + type + (spec || lv), 34, 40); }
    // the plain weapon picture is the cat claw (i_weapon_claw); until it exists the rare claw stands in, then the old sword
    function icon(key) {
        if (key === 'weapon') return gen('i_weapon_claw') || gen('it_weapon_2_3') || sprite('i_weapon', 16, 16);
        return sprite('i_' + key, 16, 16);
    }
    function decoSprite(kind) { return sprite('d_' + kind, 16, 20); }
    // gear picture: 영웅·전설·신화 have their own images (img/it_{slot}_{r}_{n}.png) when they exist, else the slot icon.
    // The image is shown at the slot icon's size whatever its pixel size.
    const itemSprites = {};
    function itemIcon(it) {
        const name = 'it_' + it.slot + '_' + it.r + '_' + itemForm(it), g = gen(name);   // grades 일반 to 신화 each have their own picture per slot
        if (!g) return icon(it.slot);
        if (!itemSprites[name]) { const base = sprite('i_' + it.slot, 16, 16); itemSprites[name] = { img: g.img, white: g.white, w: base.w, h: base.h, hi: true }; }
        return itemSprites[name];
    }

    function iconURL(key, scale = 2) {
        const s = icon(key);
        const c = canvas(16 * scale, 16 * scale), x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(s.img, 0, 0, c.width, c.height);
        return c.toDataURL();
    }
    // a scaled copy as a DOM canvas element. The high-quality downscale is done once per sprite+size and then
    // copied 1:1 (big bags / 연속 소환 lists draw thousands of the same icon)
    const scaled = new WeakMap();
    function scaledCopy(s, scale) {
        const w = Math.round(s.w * scale), hh = Math.round(s.h * scale), k = w + 'x' + hh;
        let m = scaled.get(s); if (!m) scaled.set(s, m = {});
        let src = m[k];
        if (!src) {
            src = m[k] = canvas(w, hh); const sx = src.getContext('2d');
            sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'; sx.drawImage(s.img, 0, 0, w, hh);
        }
        return src;
    }
    function domCanvas(s, scale) {
        const src = scaledCopy(s, scale), c = canvas(src.width, src.height);
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }
    // the same picture as an <img> (shared data URL): far cheaper than a canvas each when a list has thousands
    function domImg(s, scale) {
        const src = scaledCopy(s, scale);
        if (!src.url) src.url = src.toDataURL();
        return h('img', { src: src.url, width: src.width, height: src.height, draggable: 'false' });
    }

    // ------------------------------------------------------------ battlefield background
    // per chapter theme: fallback ground/path colours (only used if a texture failed to load) and decorations
    const THEMES = {
        grass:   { ground: '#4f8a3a', path: '#b08a5a', deco: ['tree', 'tree', 'bush', 'rock', 'flower'] },
        forest:  { ground: '#2f5a32', path: '#7a6a4a', deco: ['pine', 'pine', 'pine', 'mush', 'bush', 'rock'] },
        ruin:    { ground: '#4a4458', path: '#8a8070', deco: ['pillar', 'deadtree', 'rock', 'grave', 'crystal'] },
        snow:    { ground: '#c8d8e8', path: '#8a9ab0', deco: ['pine', 'pine', 'rock', 'crystal'] },
        desert:  { ground: '#d8b878', path: '#a88850', deco: ['rock', 'rock', 'pillar', 'deadtree'] },
        swamp:   { ground: '#3a5a40', path: '#5a5a3a', deco: ['mush', 'mush', 'deadtree', 'bush', 'pine'] },
        volcano: { ground: '#3a2a2a', path: '#6a4a3a', deco: ['rock', 'rock', 'crystal', 'deadtree'] },
        void:    { ground: '#2a2440', path: '#5a5078', deco: ['crystal', 'crystal', 'pillar', 'grave'] },
        sky:     { ground: '#9cc8e8', path: '#e8e0d0', deco: ['flower', 'bush', 'pillar', 'crystal'] },
        clock:   { ground: '#5a4a3a', path: '#a08860', deco: ['pillar', 'pillar', 'rock', 'crystal'] },
    };

    function background(map, theme, slots) {
        const T = THEMES[theme] || THEMES.grass;
        const bgTex = loaded['bg_' + theme], pathTex = loaded['path_' + theme];
        const big = canvas(W, H), x = big.getContext('2d');
        const stroke = (w, style) => {
            x.strokeStyle = style; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round';
            for (const p of map.paths) { x.beginPath(); x.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) x.lineTo(p[i][0], p[i][1]); x.stroke(); }
        };
        x.fillStyle = bgTex ? x.createPattern(bgTex.img, 'repeat') : T.ground; x.fillRect(0, 0, W, H);
        x.fillStyle = theme === 'grass' ? 'rgba(10,20,10,.16)' : 'rgba(5,8,12,.34)'; x.fillRect(0, 0, W, H);   // calm the ground so units pop
        stroke(64, 'rgba(0,0,0,.45)');
        stroke(56, 'rgba(255,232,180,.38)');      // light rim keeps the road readable on dark ground
        stroke(50, pathTex ? x.createPattern(pathTex.img, 'repeat') : T.path);
        if (theme !== 'grass') stroke(50, 'rgba(255,240,210,.10)');
        // decorations away from the road and the build slots
        const rng = makeRng(map.paths[0].length * 977 + theme.length * 31);
        const deco = [];
        for (let i = 0; i < 240 && deco.length < 42; i++) {
            const px = rng() * W, py = 60 + rng() * (H - 80);
            if (nearPath(map, px, py) < 50) continue;
            if (slots.some(s => dist2(s.x, s.y, px, py) < 55 * 55)) continue;
            if (deco.some(d => dist2(d.x, d.y, px, py) < 34 * 34)) continue;
            deco.push({ x: px, y: py, kind: T.deco[Math.floor(rng() * T.deco.length)] });
        }
        deco.sort((a, b) => a.y - b.y);
        for (const d of deco) {
            const s = decoSprite(d.kind);
            x.drawImage(s.img, Math.round(d.x - s.w), Math.round(d.y - s.h * 2), s.w * 2, s.h * 2);
        }
        // gate at the end of path 0
        const end = map.paths[0][map.paths[0].length - 1];
        const g = sprite('gate', 30, 30);
        x.drawImage(g.img, Math.round(end[0] - g.w + 10), Math.round(end[1] - g.h * 2 + 30), g.w * 2, g.h * 2);
        return big;
    }

    function nearPath(map, px, py) {
        let best = 1e9;
        for (const p of map.paths) for (let i = 1; i < p.length; i++) {
            const q = closestOnSeg(px, py, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
            best = Math.min(best, dist(px, py, q.x, q.y));
        }
        return best;
    }

    return { load, gen, enemy, hero, soldier, tower, icon, itemIcon, iconURL, domCanvas, domImg, background, nearPath, decoSprite };
})();
