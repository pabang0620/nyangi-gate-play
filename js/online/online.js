'use strict';
// Online layer (Supabase): guest sign-in, server clock, cloud save, rankings, real league, reward inbox, Google link,
// purchase verification. Server: server/supabase (SQL RPCs + verify-purchase function), docs/PLAN_ONLINE_RELEASE.md.
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
        try {
            this.sb = supabase.createClient(ONLINE_CONFIG.url, ONLINE_CONFIG.anonKey, { db: { schema: ONLINE_CONFIG.schema || 'public' }, auth: { persistSession: true, storageKey: 'nyangi-auth', autoRefreshToken: true } });
            let { data: { session } } = await this.sb.auth.getSession();
            if (!session) { const r = await this.sb.auth.signInAnonymously(); if (r.error) throw r.error; session = r.data.session; }
            this.user = session.user;
            await this.syncClock();
            this.cfg = (await this.sb.rpc('online_config')).data;
            this.profile = (await this.sb.from('profiles').select('*').eq('uid', this.user.id).maybeSingle()).data;
            this.status = 'online'; this.emit();
            await this.pullSave();
            await this.refreshMail();
            if (typeof window !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) this.pushSave(true); });
        } catch (e) {
            console.warn('online init failed', e);
            this.status = 'error'; this.emit();
        }
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
        const { error } = await this.sb.from('saves').upsert({ uid: this.user.id, data: p, rev: p.rev || 0, saved_ms: Math.round(p.savedMs || nowMs()), updated_at: new Date(nowMs()).toISOString() });
        // the server refuses saves over its size limit (saves.save_size): huge bags after 연속 소환. Say so once per session
        if (error && /save_size/.test(error.message || '') && !this.sizeWarned) { this.sizeWarned = true; toast(L('클라우드 저장 실패: 진행 데이터가 너무 큽니다. 가방의 장비를 분해해 주세요')); }
    },
    async pullSave() {
        const { data } = await this.sb.from('saves').select('data, rev, saved_ms').eq('uid', this.user.id).maybeSingle();
        const local = Save.p;
        if (!data) { await this.pushSave(true); return; }
        // the cloud copy is from another device and newer: let the player choose
        // (compared on progress, currencies and collections, so a newer gem purchase / summon on the other device is not overwritten silently)
        const sig = s => JSON.stringify([s.stars, s.hstars, s.gems, s.tickets, (s.items || []).length, s.shop && s.shop.skins, s.shop && s.shop.purchases && s.shop.purchases.length]);
        if (Number(data.saved_ms) > (local.savedMs || 0) + 5000 && sig(data.data) !== sig(local)) {
            if (typeof UI !== 'undefined' && UI.cloudChoice) UI.cloudChoice(data.data, local, keepCloud => {
                if (keepCloud) { Save.p = data.data; localStorage.setItem(SAVE_KEY, JSON.stringify(Save.p)); location.reload(); }
                else this.pushSave(true);
            });
        } else await this.pushSave(true);
    },

    // ---------------------------------------------------------------- profile
    async setProfile(name, hero, skin) {
        const { data, error } = await this.sb.rpc('set_profile', { p_name: name, p_hero: hero, p_skin: skin || null });
        if (error) throw new Error(/length/.test(error.message) ? L('닉네임은 2~12자로 지어 주세요') : /chars/.test(error.message) ? L('글자, 숫자, 공백, _만 쓸 수 있습니다') : /reserved/.test(error.message) ? L('쓸 수 없는 닉네임입니다') : /cooldown/.test(error.message) ? L('닉네임은 하루에 한 번만 바꿀 수 있습니다') : L('저장하지 못했습니다'));
        this.profile = data;
        if (Save.p) { Save.p.profileName = data.name; }
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
        if (r.kind === 'cup' || r.kind === 'raid') return L('{0} {1}위 (상위 {2}%)', r.kind === 'cup' ? L('주간 공방전') : L('토벌전 랭킹'), P.rank, Math.max(1, Math.round(P.top * 100)));
        if (r.kind === 'coupon') return L('쿠폰: {0}', P.title || r.ref);
        if (r.kind === 'world') return L('월드 보스 기여 {0}위 (상위 {1}%)', P.rank, Math.max(1, Math.round(P.top * 100)));
        if (r.kind === 'raidcard') return L('레이드 보상 카드') + (P.pity ? L(' · 천장') : '');
        return P.title || L('우편');
    },
    // grant one claimed row (also the league achievements the offline AI league counts in Meta.claimLeague)
    applyMail(r) {
        const P = r.payload || {};
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
        this.emit();
        return this.mail;
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
    async claimRewards() {
        if (!this.on) return [];
        const { data, error } = await this.sb.rpc('claim_rewards');
        if (error || !data || !data.length) return [];
        const got = [], lines = [];
        for (const r of data) { got.push(...this.applyMail(r)); lines.push(this.mailTitle(r)); const m = this.mail.find(x => x.id === r.id); if (m) m.claimed_at = r.claimed_at; }
        Save.save(); this.pushSave(true); this.emit();
        if (typeof UI !== 'undefined' && got.length) UI.showGot(lines.slice(0, 3).join(' · ') + (lines.length > 3 ? L(' 외 {0}개', lines.length - 3) : ''), got);
        return got;
    },
    // coupon: the reward goes to the mailbox. Returns '' on success or an error message
    async redeemCoupon(code) {
        if (!this.on) return L('온라인 연결이 필요합니다');
        const { data, error } = await this.sb.rpc('redeem_coupon', { p_code: code });
        if (error) return /too fast/.test(error.message || '') ? L('잠시 후 다시 입력해 주세요') : L('쿠폰을 확인하지 못했어요');
        if (data && data.error) return { invalid: L('없거나 기간이 끝난 쿠폰이에요'), used_up: L('선착순이 끝난 쿠폰이에요'), already: L('이미 사용한 쿠폰이에요') }[data.error] || L('쿠폰을 확인하지 못했어요');
        await this.refreshMail();
        return '';
    },

    // ---------------------------------------------------------------- Google account (keeps the same uid: guest progress stays)
    isLinked() { return !!(this.user && (this.user.identities || []).some(i => i.provider === 'google')); },
    async linkGoogle() {
        if (!this.on) throw new Error(L('온라인 연결이 필요합니다'));
        const native = typeof window !== 'undefined' && window.BonghwaBridge && window.BonghwaBridge.googleIdToken;
        if (native) {
            const token = await window.BonghwaBridge.googleIdToken(ONLINE_CONFIG.googleWebClientId);
            if (!token) throw new Error(L('Google 로그인을 취소했습니다'));
            let r = await this.sb.auth.linkIdentity({ provider: 'google', token });
            if (r.error && /already/i.test(r.error.message)) {
                // this Google account already has progress (another device): switch to it
                r = await this.sb.auth.signInWithIdToken({ provider: 'google', token });
                if (r.error) throw r.error;
                location.reload(); return;
            }
            if (r.error) throw r.error;
            this.user = (await this.sb.auth.getUser()).data.user;
            this.emit();
        } else {
            // browser / PWA: OAuth redirect, the anonymous user gets the identity linked
            const r = await this.sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: location.href } });
            if (r.error) throw r.error;
        }
    },

    // ---------------------------------------------------------------- account deletion (store policy): server data, then this device
    async deleteAccount() {
        if (!this.on) throw new Error(L('온라인 연결이 필요합니다'));
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
