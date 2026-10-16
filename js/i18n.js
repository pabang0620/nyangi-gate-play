'use strict';
// Translations. Every player-facing string is written in Korean and goes through L('원문', ...args): the Korean text is
// the key, js/i18n/<lang>.js fill I18N[lang] = { '원문': '번역' }. {0}, {1}… are replaced by args. A missing key
// falls back to Korean, so the game never shows a blank. tools/i18n.mjs finds new or untranslated strings.
// Node tools load this too (no window/localStorage there -> Korean).
const LANGS = {
    ko: '한국어', en: 'English', ja: '日本語', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
    es: 'Español', pt: 'Português', de: 'Deutsch', fr: 'Français',
};
const I18N = {};
const LANG_KEY = 'nyangi_lang';

function pickLang() {
    try {
        const saved = typeof localStorage !== 'undefined' && localStorage.getItem(LANG_KEY);
        if (saved && LANGS[saved]) return saved;
    } catch (e) { /* storage blocked */ }
    const nav = ((typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []).filter(Boolean);
    for (const raw of nav) {
        const l = String(raw || '').toLowerCase();
        if (l.startsWith('ko')) return 'ko';
        if (l.startsWith('ja')) return 'ja';
        if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
        for (const k of ['en', 'es', 'pt', 'de', 'fr']) if (l.startsWith(k)) return k;
    }
    return nav.length ? 'en' : 'ko';            // unknown device language -> English; Node tools -> Korean
}
let LANG = pickLang();

// A key may carry a context after '##' when one Korean word has two meanings ('영웅##등급' = the Epic rarity, not
// the Hero tab). The context is only for translators: Korean (and a missing translation) shows the part before it.
// L_SRC remembers translated text -> Korean so game logic that must not depend on the language can use the
// original (srcOf): wave layouts are seeded from the Korean stage name, so every language plays the same waves.
const L_SRC = new Map();
function srcOf(text) { return L_SRC.get(text) ?? text; }
function L(s, ...args) {
    let t = null;
    if (LANG !== 'ko') { const d = I18N[LANG]; if (d && d[s]) t = d[s]; }
    const ko = s.indexOf('##') < 0 ? s : s.slice(0, s.indexOf('##'));
    if (t === null) t = ko; else if (!args.length) L_SRC.set(t, ko);
    return args.length ? t.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined || args[i] === null ? '' : args[i])) : t;
}

// language picker in settings: stored per device, applied by reloading (data tables are built at load time)
function setLang(code) {
    if (!LANGS[code]) return;
    try { localStorage.setItem(LANG_KEY, code); } catch (e) { }
    if (typeof location !== 'undefined') location.reload();
}
