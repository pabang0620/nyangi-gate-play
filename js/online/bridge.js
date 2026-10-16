'use strict';
// Promise API over the Android app's native interface (android/app/.../MainActivity.java, window.NyangiNative).
// Each call passes a callback id; the app answers with window.__nativeResolve(id, json). In a browser there is no
// NyangiNative and window.BonghwaBridge stays undefined, so the game uses its test dialogs (or nothing in release).
(function () {
    const N = typeof window !== 'undefined' && window.NyangiNative;
    if (!N) return;
    let seq = 0;
    const waiting = {};
    window.__nativeResolve = (id, json) => {
        const w = waiting[id]; if (!w) return;
        delete waiting[id];
        let v = null; try { v = JSON.parse(json); } catch (e) { }
        w(v);
    };
    const call = (method, ...args) => new Promise(res => {
        const id = 'n' + (++seq);
        waiting[id] = res;
        try { N[method](...args, id); } catch (e) { delete waiting[id]; res(null); }
    });
    window.BonghwaBridge = {
        // -> { ok, productId, token } (token = Play purchase token, verified by the server before granting)
        purchase: productId => call('purchase', productId).then(r => r || { ok: false }),
        // consumables (gems, monthly) are consumed, one-time items are acknowledged
        finishPurchase: (token, consumable) => call('finishPurchase', token, !!consumable),
        // -> { productId: '₩3,300' | '$2.49' … } local-currency prices from Play
        prices: ids => call('prices', ids.join(',')).then(r => (r && r.prices) || {}),
        // -> [{ productId, token }] one-time items owned by this Play account (reinstall/restore)
        restorePurchases: () => call('restorePurchases').then(r => (r && r.items) || []),
        // -> true when the rewarded ad was watched to the end
        showRewardedAd: placement => call('showRewardedAd', placement).then(r => !!(r && r.ok)),
        // ad consent (UMP): true where the player must be able to change it (EEA/UK…); opens Google's privacy options form
        adPrivacyRequired: () => call('adPrivacyRequired').then(r => !!(r && r.ok)),
        adPrivacyOptions: () => call('adPrivacyOptions').then(r => !!(r && r.ok)),
        // -> Google ID token for Supabase (Credential Manager), or null
        googleIdToken: webClientId => call('googleIdToken', webClientId || '').then(r => (r && r.token) || null),
    };
})();
