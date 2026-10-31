'use strict';
// Online layer (Supabase): guest sign-in, server clock, cloud save, rankings, real league, reward inbox, account links
// (Google, Kakao, game id + password), purchase verification. Server: server/supabase (SQL RPCs + verify-purchase function), docs/PLAN_ONLINE_RELEASE.md.
// Every call is optional: when the project is not configured or the network is down, the game keeps playing offline.
const Online = {
    sb: null, user: null, profile: null, cfg: null,
    status: 'off',                       // off (not configured) | connecting | online | error
    get enabled() { return !!(typeof ONLINE_CONFIG !== 'undefined' && ONLINE_CONFIG.url && ONLINE_CONFIG.anonKey && typeof supabase !== 'undefined'); },
    get on() { return this.status === 'online' && !!this.user; },
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    emit() { for (const f of this.listeners) try { f(this.status); } catch (e) { } },

    async init() {
        if (!this.enabled) return;
        this.status = 'connecting'; this.emit();
        // coming back from a Kakao / Google page: the result is in the address (#access_token=... or ?error=...)
        const back = typeof location !== 'undefined' ? new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1)) : new URLSearchParams();
        const authErr = back.get('error_code') || back.get('error');
        try {
            this.sb = this.sb || supabase.createClient(ONLINE_CONFIG.url, ONLINE_CONFIG.anonKey, { db: { schema: ONLINE_CONFIG.schema || 'public' }, auth: { persistSession: true, storageKey: 'nyangi-auth', autoRefreshToken: true } });
            const { data: { session } } = await this.sb.auth.getSession();
            if (!session) {
                // first visit: the title screen asks how to start (guest / Google / Kakao / id). It needs the login switches
                const c = await this.sb.rpc('online_config'); if (c.error) throw c.error;
                this.cfg = c.data;
                if (authErr) setTimeout(() => toast(L('로그인하지 못했어요. 다시 시도해 주세요')), 600);
                this.status = 'login'; this.emit(); return;
            }
            await this.begin(session, back, authErr);
        } catch (e) {
            console.warn('online init failed', e);
            this.status = 'error'; this.emit();
        }
    },
    // started without a connection (or it failed on the way): try again when the app comes back or the network returns
    async retry() {
        if (!this.enabled || this.status !== 'error' || this.retrying) return;
        if (typeof UI !== 'undefined' && UI.S && UI.S.screen === 'battle') return;   // pullSave may ask or reload: not in a battle
        this.retrying = true;
        try { await this.init(); } finally { this.retrying = false; }
    },
    // a guest account (title 게스트로 시작, or the game started before choosing)
    async startGuest() {
        if (this.status !== 'login') return;
        this.status = 'connecting'; this.emit();
        try {
            const r = await this.sb.auth.signInAnonymously(); if (r.error) throw r.error;
            await this.begin(r.data.session, new URLSearchParams(), null);
        } catch (e) { console.warn('guest sign-in failed', e); this.status = 'error'; this.emit(); }
    },
    // 회원가입 on the title: a new account with a game id + password (a guest that gets an id right away)
    async signUp(id, password) {
        id = String(id || '').trim().toLowerCase();
        if (!/^[a-z0-9_]{4,16}$/.test(id)) throw new Error(L('아이디는 영어 소문자, 숫자, _ 로 4~16자예요'));
        if (String(password || '').length < 8) throw new Error(L('비밀번호는 8자 이상으로 정해 주세요'));
        await this.startGuest();
        if (!this.on) throw new Error(L('인터넷에 연결되지 않았어요'));
        return this.setLogin(id, password);
    },
    async begin(session, back, authErr) {
        this.user = session.user;
        if (back.has('access_token') || authErr) try { history.replaceState(null, '', location.pathname); } catch (e) { }
        if (authErr) setTimeout(() => toast(/identity_already_exists|already/i.test(authErr + (back.get('error_description') || ''))
            ? L('이미 다른 진행에 연결된 계정이에요. 설정의 다른 계정으로 로그인에서 그 계정으로 들어갈 수 있어요')
            : L('로그인하지 못했어요. 다시 시도해 주세요')), 600);
        await this.syncClock();
        // a failed read is not "no profile": the game would ask for a new nickname. Fail the start instead (retry() later)
        const c = await this.sb.rpc('online_config'); if (c.error) throw c.error;
        this.cfg = c.data;
        const pr = await this.sb.from('profiles').select('*').eq('uid', this.user.id).maybeSingle(); if (pr.error) throw pr.error;
        this.profile = pr.data;
        this.status = 'online'; this.emit();
        await this.pullSave();
        await this.refreshMail();
        if (typeof window !== 'undefined' && !this.hideHooked) { this.hideHooked = true; document.addEventListener('visibilitychange', () => { if (document.hidden) this.pushSave(true); }); }
    },
    // this device's id in the save: the server backs up the cloud copy when another device's save replaces it (20261037)
    deviceId() {
        try {
            let d = localStorage.getItem('nyangi-device');
            if (!d) { d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('nyangi-device', d); }
            return d;
        } catch (e) { return null; }
    },
    // progress about to be dropped from this device (the other copy was chosen, or it belongs to another account):
    // kept on the server for support (restored only by the operator, docs/OPERATIONS.md) and in one local slot
    async backupLocal(p, reason) {
        if (!p) return;
        try { localStorage.setItem('nyangi-backup', JSON.stringify({ at: nowMs(), reason, data: p })); } catch (e) { }
        if (!this.sb || !this.user) return;
        try { const { error } = await this.sb.rpc('save_backup', { p_data: p, p_reason: reason }); if (error) console.warn('save_backup', error.message); } catch (e) { }
    },

    // ---------------------------------------------------------------- server clock
    async syncClock() {
        const t0 = Date.now();
        const { data, error } = await this.sb.rpc('server_now');
        if (error || !data) return;
        const t1 = Date.now();
        TIME_OFFSET = Number(data) - (t0 + t1) / 2;
    },

    // ---------------------------------------------------------------- cloud save (last writer wins, newer-remote asks)
    pushTimer: null,
    saved() { if (!this.on) return; clearTimeout(this.pushTimer); this.pushTimer = setTimeout(() => this.pushSave(), 15000); },
    async pushSave(now) {
        if (!this.on || !Save.p) return;
        clearTimeout(this.pushTimer);
        const p = Save.p;
        p.owner = this.user.id;   // whose progress this is: a different account on this device must not adopt it (see pullSave)
        p.device = this.deviceId();
        p.ownerGuest = !this.isLinked();   // a guest's progress may move to the first account it signs in to; a linked account's never does (see pullSave)
        const { error } = await this.sb.from('saves').upsert({ uid: this.user.id, data: p, rev: p.rev || 0, saved_ms: Math.round(p.savedMs || nowMs()), updated_at: new Date(nowMs()).toISOString() });
        // the server refuses saves over its size limit (saves.save_size): huge bags after 연속 소환. Say so once per session
        if (error && /save_size/.test(error.message || '') && !this.sizeWarned) { this.sizeWarned = true; toast(L('진행을 저장하지 못했습니다. 가방에 장비가 너무 많아요. 장비를 분해해 주세요')); }
    },
    async pullSave() {
        // a failed read is not "no cloud save": treating it so would push this device's copy over the account's progress
        const { data, error } = await this.sb.from('saves').select('data, rev, saved_ms').eq('uid', this.user.id).maybeSingle();
        if (error) throw error;
        const local = Save.p;
        // just signed in to another account: this device's progress belongs to the previous one, so always ask when they differ
        let switched = false, fresh = false;
        try { switched = localStorage.getItem('nyangi-switch') === '1'; localStorage.removeItem('nyangi-switch'); } catch (e) { }
        try { fresh = localStorage.getItem('nyangi-fresh') === '1'; localStorage.removeItem('nyangi-fresh'); } catch (e) { }
        // a brand-new account never takes over progress that is still on this device: it came from another account or a lost guest session.
        // (the same account whose own first upload failed keeps it: owner matches)
        const foreign = !!(local.owner && local.owner !== this.user.id);
        const hasProgress = Object.values(local.stars || {}).some(v => v > 0) || (local.items || []).length > 2 || (local.gems || 0) !== 60;
        if (!data) { if (local.owner !== this.user.id && hasProgress) { await this.backupLocal(local, 'foreign'); Save.reset(); } await this.pushSave(true); return; }
        // signed out earlier (this device's progress was cleared), or this device has nothing of its own yet: the account's progress comes back without asking
        if (fresh || (!hasProgress && local.owner !== this.user.id)) { Save.p = data.data; localStorage.setItem(SAVE_KEY, JSON.stringify(Save.p)); location.reload(); return; }
        // the cloud copy is from another device and newer: let the player choose
        // (compared on progress, currencies and collections, so a newer gem purchase / summon on the other device is not overwritten silently)
        // another linked account's progress never moves to this one: keeping it would copy the same gems and gear into a second account.
        // The account's own progress comes back and this device's copy is only backed up. A guest's progress (ownerGuest) may still move once:
        // the guest session is gone after signing in, so nothing is left behind to copy again.
        if (foreign && local.ownerGuest === false) { await this.backupLocal(local, 'foreign_linked'); Save.p = data.data; localStorage.setItem(SAVE_KEY, JSON.stringify(Save.p)); location.reload(); return; }
        const sig = s => JSON.stringify([s.stars, s.hstars, s.gems, s.tickets, (s.items || []).length, s.shop && s.shop.skins, s.shop && s.shop.purchases && s.shop.purchases.length]);
        if ((switched || foreign || Number(data.saved_ms) > (local.savedMs || 0) + 5000) && sig(data.data) !== sig(local)) {
            if (typeof UI !== 'undefined' && UI.cloudChoice) UI.cloudChoice(data.data, local, async keepCloud => {
                if (keepCloud) { await this.backupLocal(local, 'chose_cloud'); Save.p = data.data; localStorage.setItem(SAVE_KEY, JSON.stringify(Save.p)); location.reload(); }
                // the server skips saves older than its copy (20261025): stamp now so the choice takes effect at once.
                // The replaced cloud copy is backed up by the server (another device's save, 20261037)
                else {
                    if (data.data.device && data.data.device === local.device) await this.backupLocal(data.data, 'chose_device');   // same device id: the server would not see a device change
                    Save.save(); await this.pushSave(true);
                }
            });
        } else await this.pushSave(true);
    },

    // ---------------------------------------------------------------- profile
    async setProfile(name, hero, skin) {
        const { data, error } = await this.sb.rpc('set_profile', { p_name: name, p_hero: hero, p_skin: skin || null });
        if (error) throw new Error(/length/.test(error.message) ? L('닉네임은 2~12자로 지어 주세요') : /chars/.test(error.message) ? L('글자, 숫자, 공백, _만 쓸 수 있습니다') : /reserved/.test(error.message) ? L('쓸 수 없는 닉네임입니다') : /cooldown/.test(error.message) ? L('닉네임은 하루에 한 번만 바꿀 수 있습니다') : /taken|duplicate|name_unique/.test(error.message) ? L('이미 쓰고 있는 닉네임이에요') : L('저장하지 못했습니다'));
        const first = !this.profile;
        this.profile = data;
        if (Save.p) { Save.p.profileName = data.name; }
        if (first && typeof Friends !== 'undefined') Friends.refresh();   // friends need a profile: start right away instead of on the next poll
        return data;
    },
    // keep the leaderboard look (hero/skin) in sync with the save, quietly
    async touchProfile() {
        if (!this.on || !this.profile) return;
        const p = Save.p, skin = p.shop && p.shop.skin ? p.shop.skin[p.hero] || null : null;
        if (this.profile.hero !== p.hero || (this.profile.skin || null) !== skin) try { await this.setProfile(this.profile.name, p.hero, skin); } catch (e) { }
    },

    // ---------------------------------------------------------------- scores, rankings, league
    ctx() { const p = Save.p; let hi = -1; for (const k in p.stars) if (p.stars[k] > 0) hi = Math.max(hi, +k); return { highest: hi, heroLv: p.heroes[p.hero].lv }; },
    async submit(kind, value) {
        if (!this.on || !this.profile || !(value > 0)) return null;
        const { data, error } = await this.sb.rpc('submit_score', { p_kind: kind, p_value: Math.round(value), p_ctx: this.ctx() });
        if (error) { console.warn('submit', error.message); return null; }
        return data;
    },
    async board(kind, limit = 50) {
        if (!this.on) return null;
        const { data, error } = await this.sb.rpc('board_view', { p_board: kind, p_limit: limit });
        return error ? null : data;
    },
    // 종합 순위 (Top 100): server board_overall. The top list doubles as the cache of who wears a rank mark (name#tag -> rank)
    crowns: new Map(), crownAt: 0,
    async overall(limit = 100) {
        if (!this.on) return null;
        const { data, error } = await this.sb.rpc('board_overall', { p_limit: limit });
        if (error || !data) return null;
        this.crowns = new Map((data.top || []).map(r => [r.name + '#' + r.tag, r.rank]));
        this.crownAt = Date.now();
        return data;
    },
    loadCrowns() { if (this.on && Date.now() - this.crownAt > 600000) { this.crownAt = Date.now(); this.overall(100); } },
    crownOf(name, tag) { return (name && this.crowns.get(name + '#' + tag)) || 0; },
    async league() {
        if (!this.on || !this.profile) return null;
        const { data, error } = await this.sb.rpc('league_division');
        return error ? null : data;
    },

    // ---------------------------------------------------------------- mailbox (reward_inbox: league / weekly settlements, operator mail, coupons)
    mail: [], mailOk: false,               // mailOk: the server has the mailbox RPCs (20261017000000_mail_coupon.sql)
    get mailCount() { return this.mail.filter(m => !m.claimed_at).length; },
    mailTitle(r) {
        const P = r.payload || {};
        if (r.kind === 'league') return L('리그 시즌 {0}위', P.rank) + (P.newTier > P.tier ? L(' · 승급!') : P.newTier < P.tier ? L(' · 강등') : '');
        if (r.kind === 'cup' || r.kind === 'raid' || r.kind === 'tower') return L('{0} {1}위 (상위 {2}%)', r.kind === 'cup' ? L('주간 공방전') : r.kind === 'tower' ? L('심연의 탑') : L('토벌전 랭킹'), P.rank, Math.max(1, Math.round(P.top * 100)));
        if (r.kind === 'coupon') return L('쿠폰: {0}', P.title || r.ref);
        if (r.kind === 'world') return L('월드 보스 기여 {0}위 (상위 {1}%)', P.rank, Math.max(1, Math.round(P.top * 100)));
        if (r.kind === 'raidcard') return L('레이드 보상 카드') + (P.pity ? L(' · 천장') : '');
        return P.title || L('우편');
    },
    // grant one claimed row (also the league achievements the offline AI league counts in Meta.claimLeague)
    // Save.p.mailGot: ids already granted on this save, so a row is never granted twice (claimMail and the recovery in refreshMail)
    applyMail(r) {
        const P = r.payload || {}, done = Save.p.mailGot = Save.p.mailGot || [];
        if (done.includes(r.id)) return [];
        done.push(r.id);
        const got = P.reward ? Rewards.grant(Save.p, P.reward) : [];
        if (r.kind === 'league') {
            if (this.profile) this.profile.tier = P.newTier;
            const st = Save.p.stats = Save.p.stats || {};
            if (P.rank === 1) st.league1 = (st.league1 || 0) + 1;
            if (P.rank <= 3) st.league3 = (st.league3 || 0) + 1;
        }
        return got;
    },
    async refreshMail() {
        if (!this.on) return [];
        const { data, error } = await this.sb.rpc('list_mail');
        if (error) { this.mailOk = false; await this.claimRewards(); return []; }   // server without the mailbox yet: old auto-claim
        this.mailOk = true; this.mail = data || [];
        this.recoverMail();
        this.emit();
        return this.mail;
    },
    // a claim the server took but whose answer never reached this device (connection lost): grant it now.
    // First run with this version: everything already claimed counts as granted. Only recent claims, so another device's
    // claims from long ago are not granted again here
    recoverMail() {
        const p = Save.p; if (!p) return;
        const claimed = this.mail.filter(m => m.claimed_at);
        if (!p.mailGot) { p.mailGot = claimed.map(m => m.id); Save.save(); return; }
        const lost = claimed.filter(m => !p.mailGot.includes(m.id) && nowMs() - Date.parse(m.claimed_at) < 30 * 60000);
        const got = [], lines = [];
        for (const r of lost) { got.push(...this.applyMail(r)); lines.push(this.mailTitle(r)); }
        const ids = new Set(this.mail.map(m => m.id));
        p.mailGot = p.mailGot.filter(id => ids.has(id));   // rows older than the mailbox window can't come back
        if (!lost.length) return;
        Save.save(); this.pushSave(true);
        if (typeof UI !== 'undefined' && got.length) UI.showGot(lines.slice(0, 3).join(' · '), got);
    },
    async claimMail(id) {
        if (!this.on) return null;
        const { data, error } = await this.sb.rpc('claim_mail', { p_id: id });
        if (error || !data || !data.length) return null;
        const got = this.applyMail(data[0]);
        const m = this.mail.find(x => x.id === id); if (m) m.claimed_at = data[0].claimed_at;
        Save.save(); this.pushSave(true); this.emit();
        return got;
    },
    // claim everything at once (also the fallback when the server has no mailbox yet)
    async claimRewards(quiet) {
        if (!this.on) return [];
        const { data, error } = await this.sb.rpc('claim_rewards');
        if (error || !data || !data.length) return [];
        const got = [], lines = [];
        for (const r of data) { got.push(...this.applyMail(r)); lines.push(this.mailTitle(r)); const m = this.mail.find(x => x.id === r.id); if (m) m.claimed_at = r.claimed_at; }
        Save.save(); this.pushSave(true); this.emit();
        this.lastGotTitle = lines.slice(0, 3).join(' · ') + (lines.length > 3 ? L(' 외 {0}개', lines.length - 3) : '');
        // quiet: the mailbox shows the reward window itself, after it has redrawn
        if (!quiet && typeof UI !== 'undefined' && got.length) UI.showGot(this.lastGotTitle, got);
        return got;
    },
    // coupon: the reward goes to the mailbox. Returns '' on success or an error message
    async redeemCoupon(code) {
        if (!this.on) return L('인터넷 연결이 필요해요');
        const { data, error } = await this.sb.rpc('redeem_coupon', { p_code: code });
        if (error) return /too fast/.test(error.message || '') ? L('잠시 후 다시 입력해 주세요') : L('쿠폰을 확인하지 못했어요');
        if (data && data.error) return { invalid: L('없거나 기간이 끝난 쿠폰이에요'), used_up: L('선착순이 끝난 쿠폰이에요'), already: L('이미 사용한 쿠폰이에요') }[data.error] || L('쿠폰을 확인하지 못했어요');
        await this.refreshMail();
        return '';
    },

    // ---------------------------------------------------------------- accounts (a link keeps the same uid: guest progress stays)
    // Google: the app asks Android for an ID token, the browser goes through Google's page.
    // Kakao: Kakao's page (the app opens it in the phone browser, which comes back through nyangi-gate://auth, MainActivity).
    // Game id + password: Edge Function bonghwa-login stores it as a never-mailed address <id>@id.nyangi-gate.app.
    // Signing in to another account reloads the game, and pullSave then asks which progress to keep.
    LOGIN_DOMAIN: '@id.nyangi-gate.app',
    get nativeGoogle() { return typeof window !== 'undefined' && !!(window.BonghwaBridge && window.BonghwaBridge.googleIdToken); },
    get inApp() { return typeof navigator !== 'undefined' && /NyangiApp/.test(navigator.userAgent); },
    loginId() { const e = this.user && this.user.email; return e && e.endsWith(this.LOGIN_DOMAIN) ? e.slice(0, -this.LOGIN_DOMAIN.length) : ''; },
    // 'google' | 'kakao' | 'id' this account can be opened with on another device
    logins() {
        const ids = ((this.user && this.user.identities) || []).map(i => i.provider), out = [];
        if (ids.includes('google')) out.push('google');
        if (ids.includes('kakao')) out.push('kakao');
        if (this.loginId()) out.push('id');
        return out;
    },
    isLinked() { return this.logins().length > 0; },
    // turned on in game_config 'auth' once the provider is set up in Supabase (Kakao app, Google web client secret)
    kakaoOn() { return !!(this.cfg && this.cfg.auth && this.cfg.auth.kakao); },
    googleOn() { return this.nativeGoogle || !!(this.cfg && this.cfg.auth && this.cfg.auth.googleWeb); },
    markSwitch() { try { localStorage.setItem('nyangi-switch', '1'); } catch (e) { } },
    async refreshUser() { this.user = (await this.sb.auth.getUser()).data.user || this.user; this.emit(); },

    // OAuth page (Kakao everywhere, Google in the browser). link = attach to this account, otherwise sign in to that account
    async oauth(provider, link) {
        if (!this.sb) throw new Error(L('인터넷 연결이 필요해요'));
        const redirectTo = this.inApp ? 'nyangi-gate://auth' : location.origin + location.pathname;
        const options = { redirectTo, skipBrowserRedirect: true };
        const r = link ? await this.sb.auth.linkIdentity({ provider, options }) : await this.sb.auth.signInWithOAuth({ provider, options });
        if (r.error) throw r.error;
        if (!link) this.markSwitch();
        if (this.inApp) toast(L('브라우저에서 로그인을 마치면 게임으로 돌아와요'));
        location.href = r.data.url;   // in the app this opens the phone browser (MainActivity.shouldOverrideUrlLoading)
    },
    async linkGoogle() {
        if (!this.on) throw new Error(L('인터넷 연결이 필요해요'));
        if (!this.nativeGoogle) return this.oauth('google', true);
        const token = await window.BonghwaBridge.googleIdToken(ONLINE_CONFIG.googleWebClientId);
        if (!token) throw new Error(L('Google 로그인을 취소했습니다'));
        let r = await this.sb.auth.linkIdentity({ provider: 'google', token });
        if (r.error && /already/i.test(r.error.message)) {
            // this Google account already has progress (another device): switch to it
            r = await this.sb.auth.signInWithIdToken({ provider: 'google', token });
            if (r.error) throw r.error;
            this.markSwitch(); location.reload(); return;
        }
        if (r.error) throw r.error;
        await this.refreshUser();
    },
    async loginGoogle() {
        if (!this.sb) throw new Error(L('인터넷 연결이 필요해요'));
        if (!this.nativeGoogle) return this.oauth('google', false);
        const token = await window.BonghwaBridge.googleIdToken(ONLINE_CONFIG.googleWebClientId);
        if (!token) throw new Error(L('Google 로그인을 취소했습니다'));
        const r = await this.sb.auth.signInWithIdToken({ provider: 'google', token });
        if (r.error) throw r.error;
        this.markSwitch(); location.reload();
    },
    get nativeKakao() { return typeof window !== 'undefined' && !!(window.BonghwaBridge && window.BonghwaBridge.kakaoIdToken); },
    // in the app: KakaoTalk confirms in one tap and hands an ID token (no browser, no Kakao 2-step check). Web: the Kakao page
    async linkKakao() {
        if (!this.on) throw new Error(L('인터넷 연결이 필요해요'));
        if (!this.nativeKakao) return this.oauth('kakao', true);
        const token = await window.BonghwaBridge.kakaoIdToken();
        if (!token) throw new Error(L('카카오 로그인을 취소했어요'));
        let r = await this.sb.auth.linkIdentity({ provider: 'kakao', token });
        if (r.error && /already/i.test(r.error.message)) {
            // this Kakao account already has progress (another device): switch to it
            r = await this.sb.auth.signInWithIdToken({ provider: 'kakao', token });
            if (r.error) throw r.error;
            this.markSwitch(); location.reload(); return;
        }
        if (r.error) throw r.error;
        await this.refreshUser();
    },
    async loginKakao() {
        if (!this.nativeKakao) return this.oauth('kakao', false);
        if (!this.sb) throw new Error(L('인터넷 연결이 필요해요'));
        const token = await window.BonghwaBridge.kakaoIdToken();
        if (!token) throw new Error(L('카카오 로그인을 취소했어요'));
        const r = await this.sb.auth.signInWithIdToken({ provider: 'kakao', token });
        if (r.error) throw r.error;
        this.markSwitch(); location.reload();
    },
    // make (or change) this account's game id and password
    async setLogin(id, password) {
        if (!this.on) throw new Error(L('인터넷 연결이 필요해요'));
        id = String(id || '').trim().toLowerCase();
        if (!/^[a-z0-9_]{4,16}$/.test(id)) throw new Error(L('아이디는 영어 소문자, 숫자, _ 로 4~16자예요'));
        if (String(password || '').length < 8) throw new Error(L('비밀번호는 8자 이상으로 정해 주세요'));
        const { data, error } = await this.sb.functions.invoke('bonghwa-login', { body: { id, password } });
        let reason = data && data.reason;
        if (error) { try { reason = (await error.context.json()).reason; } catch (e) { reason = 'net'; } }
        if (!data || !data.ok) throw new Error({ bad_id: L('아이디는 영어 소문자, 숫자, _ 로 4~16자예요'), bad_password: L('비밀번호는 8자 이상으로 정해 주세요'),
            taken: L('이미 쓰고 있는 아이디예요'), net: L('인터넷에 연결되지 않았어요') }[reason] || L('저장하지 못했습니다'));
        await this.sb.auth.refreshSession();   // the new address is in a fresh token
        await this.refreshUser();
        return data.id;
    },
    async loginWithId(id, password) {
        if (!this.sb) throw new Error(L('인터넷 연결이 필요해요'));
        const r = await this.sb.auth.signInWithPassword({ email: String(id || '').trim().toLowerCase() + this.LOGIN_DOMAIN, password: String(password || '') });
        if (r.error) throw new Error(/invalid/i.test(r.error.message) ? L('아이디나 비밀번호가 맞지 않아요') : /rate|many/i.test(r.error.message) ? L('잠시 후 다시 시도해 주세요') : L('로그인하지 못했어요. 다시 시도해 주세요'));
        this.markSwitch(); location.reload();
    },

    // ---------------------------------------------------------------- account deletion (store policy): server data, then this device
    // sign out: save to the account first, then clear this device like a fresh install (the title asks for a login again)
    async logout() {
        if (this.on) await this.pushSave(true);
        await this.sb.auth.signOut();
        try { localStorage.removeItem('nyangi-auth'); } catch (e) { }
        Save.reset();
        try { localStorage.setItem('nyangi-fresh', '1'); } catch (e) { }
        location.reload();
    },
    async deleteAccount() {
        if (!this.on) throw new Error(L('인터넷 연결이 필요해요'));
        const { error } = await this.sb.rpc('delete_my_account');
        if (error) throw new Error(L('삭제하지 못했습니다: ') + error.message);
        await this.sb.auth.signOut();
        try { localStorage.removeItem('nyangi-auth'); } catch (e) { }
        Save.reset();
        location.reload();
    },

    // ---------------------------------------------------------------- payments
    async verifyPurchase(productId, token) {
        if (!this.on) return { ok: false, reason: 'offline' };
        const { data, error } = await this.sb.functions.invoke('verify-purchase', { body: { productId, purchaseToken: token } });
        if (error) return { ok: false, reason: error.message };
        return data || { ok: false };
    },
};
