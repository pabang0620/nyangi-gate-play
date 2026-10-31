'use strict';
// 냥냥단 client (server: server/supabase/migrations/20261039000000_guild.sql, plan: docs/PLAN_ONLINE_V4.md section 1).
// The server decides every coin, exp point and reward; this side only pays gem / silver prices out of the save after the server
// said yes (the server first checks the cloud save holds them, so the save is pushed before those calls), and carries chat lines
// on the guild's Realtime channel (the stored copy comes from guild_chat_send, the broadcast only saves a reload).
const GuildOn = {
    st: null, at: 0, fail: null,
    ch: null, chKey: null, chat: [], onChat: null,
    call(fn, args) { return RaidOn.call(fn, args); },
    req() { return Market.req(); },
    get g() { return this.st && this.st.guild; },
    get cfg() { return this.st && this.st.cfg; },
    async state() {
        const r = await this.call('guild_state');
        this.at = Date.now();
        if (!r.error) {
            this.st = r;
            const p = Save.p, lv = r.guild ? r.guild.lv : 0;
            if (p && (p.guildLv || 0) !== lv) { p.guildLv = lv; Save.save(); }   // the stage silver bonus works offline too
        }
        return r;
    },
    // gems / silver the server took into account: out of the save now (never below zero)
    pay(cost) {
        if (!cost) return;
        const p = Save.p;
        if (cost.gems) p.gems = Math.max(0, p.gems - cost.gems);
        if (cost.silver) p.silver = Math.max(0, p.silver - cost.silver);
        Save.save(); Online.pushSave(true);
    },
    async pushFirst() { Save.save(); try { await Online.pushSave(true); } catch (e) { } },

    list(q) { return this.call('guild_list', { p_query: q || null }); },
    async create(name, emblem, intro, mode) {
        await this.pushFirst();
        const r = await this.call('guild_create', { p_name: name, p_emblem: emblem | 0, p_intro: intro || '', p_mode: mode });
        if (r.ok) { this.pay(r.cost); await this.state(); }
        return r;
    },
    async join(id) { const r = await this.call('guild_join', { p_id: id }); if (r.ok) await this.state(); return r; },
    async cancelApp(id) { const r = await this.call('guild_cancel_app', { p_id: id }); if (r.ok) await this.state(); return r; },
    async leave() { this.closeChat(); const r = await this.call('guild_leave'); if (r.ok) await this.state(); return r; },
    async decide(uid, ok) { const r = await this.call('guild_app_decide', { p_uid: uid, p_accept: !!ok }); await this.state(); return r; },
    async kick(uid) { const r = await this.call('guild_kick', { p_uid: uid }); if (r.ok) await this.state(); return r; },
    async setRole(uid, role) { const r = await this.call('guild_set_role', { p_uid: uid, p_role: role }); if (r.ok) await this.state(); return r; },
    async update(intro, mode, emblem) { const r = await this.call('guild_update', { p_intro: intro || '', p_mode: mode, p_emblem: emblem | 0 }); if (r.ok) await this.state(); return r; },
    async attend() { const r = await this.call('guild_attend'); if (r.ok) await this.state(); return r; },
    async donate(kind) {
        await this.pushFirst();
        const r = await this.call('guild_donate', { p_kind: kind });
        if (r.ok) { this.pay(r.cost); await this.state(); }
        return r;
    },
    // shop items come by mail and are claimed right away (titles stay on the server)
    async buy(item) {
        const r = await this.call('guild_shop_buy', { p_item: item, p_req: this.req() });
        if (r.ok) {
            if (this.st) { this.st.coins = Number(r.coins) || 0; this.st.buys[item] = (this.st.buys[item] || 0) + 1; }
            r.got = [];
            if (r.mail) { try { r.got = (await Online.claimMail(r.mail)) || []; } catch (e) { } }
            await this.state();
        }
        return r;
    },
    async setTitle(t) { const r = await this.call('guild_set_title', { p_title: t || null }); if (r.ok) await this.state(); return r; },
    bossBegin() { return this.call('guild_boss_begin'); },
    bossSubmit(pts) { return RaidOn.report('guild_boss_submit', { p_pts: pts | 0 }); },
    bossLeft() { const g = this.g, c = this.cfg; return g && c ? Math.max(0, c.boss.tries - (g.boss.runs || 0)) : 0; },
    // 냥단 보스 strength: this player's own progress, like the world boss
    bossStage(kind) { return RaidOn.worldStage(kind); },

    // ------------------------------------------------ chat
    async loadChat() {
        const r = await this.call('guild_chat_list');
        if (!r.error) this.chat = r.rows || [];
        return r;
    },
    openChat(onRow) {
        this.onChat = onRow;
        const g = this.g;
        if (!g || !Online.sb || this.chKey === g.key) return;
        this.closeChat(true);
        this.chKey = g.key;
        try {
            const ch = this.ch = Online.sb.channel('bonghwa-guild-' + g.key, { config: { broadcast: { self: false, ack: false } } });
            ch.on('broadcast', { event: 'msg' }, m => this.take(m.payload));
            ch.subscribe();
        } catch (e) { this.ch = null; this.chKey = null; }
    },
    closeChat(keepHandler) {
        if (!keepHandler) this.onChat = null;
        const ch = this.ch; this.ch = null; this.chKey = null;
        if (ch) try { Online.sb.removeChannel(ch); } catch (e) { }
    },
    take(row) {
        if (!row || !row.id || this.chat.some(x => x.id === row.id)) return;
        this.chat.push(row);
        if (this.chat.length > 100) this.chat.splice(0, this.chat.length - 100);
        this.unread = (this.unread || 0) + 1;
        if (this.onChat) try { this.onChat(row); } catch (e) { }
    },
    async send(text) {
        const r = await this.call('guild_chat_send', { p_text: text });
        if (r.ok) {
            this.take(r.row);
            if (this.ch) this.ch.send({ type: 'broadcast', event: 'msg', payload: r.row }).catch(() => { });
        }
        return r;
    },
    report(id) { return this.call('guild_chat_report', { p_id: id }); },

    // ------------------------------------------------ small helpers for other screens
    // stage silver bonus by guild level (cfg silverPct; the last known level is kept in the save)
    silverMul() {
        const p = typeof Save !== 'undefined' && Save.p, lv = p && p.guildLv;
        if (!lv) return 1;
        const t = (this.cfg && this.cfg.silverPct) || [0, 0, 2, 2, 4, 4, 6, 6, 8, 10];
        return 1 + (t[Math.min(t.length, lv) - 1] || 0) / 100;
    },
    // things waiting in the guild (hub badge): check-in, donation, boss tries, applications to decide
    badge() {
        const g = this.g;
        if (!Online.on || !g) return 0;
        let n = 0;
        if (!g.today.attended) n++;
        if (!g.today.donated) n++;
        if (this.bossLeft() > 0) n++;
        if ((g.role === 'leader' || g.role === 'vice') && (g.apps || []).length) n++;
        return n;
    },
    errText(e, r) {
        const c = this.cfg || {};
        return {
            no_profile: L('먼저 닉네임을 정해 주세요'), in_guild: L('이미 냥냥단에 들어가 있어요'), cooldown: L('냥냥단을 나온 뒤 24시간이 지나야 들어갈 수 있어요'),
            name_len: L('이름은 2~10자로 정해 주세요'), name_chars: L('이름에 쓸 수 없는 글자가 있어요'), bad_word: L('쓸 수 없는 말이 들어 있어요'),
            intro_len: L('소개는 60자까지 쓸 수 있어요'), name_taken: L('이미 있는 이름이에요'), gems: L('보석이 부족해요 (필요 {0})', r && r.need ? fmt(r.need) : ''),
            silver: L('은화가 부족해요 (필요 {0})', r && r.need ? fmt(r.need) : ''), not_found: L('냥냥단을 찾지 못했어요'), full: L('자리가 가득 찼어요'),
            applied: L('이미 가입 신청했어요'), too_many_apps: L('가입 신청은 동시에 {0}곳까지 할 수 있어요', c.maxApps || 3), not_member: L('냥냥단 단원이 아니에요'),
            no_right: L('권한이 없어요'), gone: L('다른 냥냥단에 들어갔거나 신청을 취소했어요'), vice_full: L('부단장은 {0}명까지예요', c.vices || 2), role: L('지금은 할 수 없어요'),
            done: L('오늘은 이미 했어요'), kind: L('지금은 할 수 없어요'), guild_lv: L('냥단 레벨 {0}부터 살 수 있어요', r && r.lv), owned: L('이미 가진 칭호예요'),
            weekly: L('이번 주에는 다 샀어요'), coins: L('냥단 코인이 부족해요'), not_owned: L('가지지 않은 칭호예요'),
            no_tries: L('오늘 도전 횟수를 다 썼어요'), no_run: L('도전 기록을 찾지 못했어요'), empty: L('내용을 입력해 주세요'), too_fast: L('잠시 후 다시 보내 주세요'),
            req: L('요청을 다시 보내 주세요'),
        }[e] || RaidOn.errText(e, r);
    },
};
