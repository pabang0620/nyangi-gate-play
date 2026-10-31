'use strict';
// 냥이 공성전 server calls (server/supabase/migrations/20261040000000_siege.sql, plan: docs/PLAN_ONLINE_V4.md 2).
// The battle is js/battle/siege.js; the screen is js/ui/siege.js. Every call returns the server's jsonb or { error }.
const SiegeOn = {
    st: null,                       // last siege_state()
    get cfg() { return this.st && this.st.cfg; },
    async call(fn, args) { return RaidOn.call(fn, args); },
    async state() { const r = await this.call('siege_state'); if (!r.error) this.st = r; return r; },
    saveBase(base) { return this.call('siege_save_base', { p_base: base }); },
    find(refresh) { return this.call('siege_find', { p_refresh: !!refresh }); },
    begin(pick, revenge) { return this.call('siege_begin', { p_pick: pick == null ? null : pick, p_revenge: revenge || null }); },
    // the result is sent again when the connection drops (the server takes it once: an attack closes once)
    finish(id, army, log, end, taken, ticks) { return RaidOn.report('siege_finish', { p_id: id, p_army: army, p_log: log, p_end: end, p_taken: taken, p_ticks: ticks }); },
    replay(id) { return this.call('siege_replay', { p_id: id }); },
    ad() { return this.call('siege_ad'); },
    flag(f) { return this.call('siege_flag', { p_flag: f || null }); },
    top() { return this.call('siege_top', { p_limit: 30 }); },
    // shop goods that come by mail (소환권, 강화석, 하락방지권) are claimed right away
    async buy(item) {
        const r = await this.call('siege_buy', { p_item: item });
        if (r.error) return r;
        if (this.st) Object.assign(this.st, { medals: r.medals, sk: r.sk, passes: r.passes, deco: r.deco, flag: r.flag });
        r.got = [];
        if (r.mail) { await Online.refreshMail(); try { r.got = (await Online.claimMail(r.mail)) || []; } catch (e) { r.got = []; } }
        return r;
    },
    // silver from a finished attack goes into the save once (attack id remembered)
    paySilver(res) {
        const p = Save.p, got = p.siegeGot = p.siegeGot || [];
        if (!res || !(res.silver > 0) || got.includes(res.id)) return 0;
        got.push(res.id); if (got.length > 50) got.splice(0, got.length - 50);
        p.silver += res.silver; Save.save();
        return res.silver;
    },
    errText(e) {
        return {
            no_base: L('먼저 내 성채를 저장해 주세요'), bad_base: L('성채 배치가 규칙에 맞지 않아요'), too_fast: L('잠시 후 다시 시도해 주세요'),
            no_attacks: L('오늘 공격 횟수를 다 썼어요'), no_target: L('상대를 다시 찾아 주세요'), shielded: L('상대가 보호막을 켰어요. 다른 상대를 골라 주세요'),
            no_revenge: L('복수할 수 없는 기록이에요'), army: L('군단 편성이 규칙에 맞지 않아요'), codex: L('도감에서 만나지 않은 적이 있어요'), log: L('전투 기록이 올바르지 않아요'),
            result: L('전투 결과가 올바르지 않아요'), expired: L('공격 시간이 지났어요'), closed: L('이미 끝난 공격이에요'), ad_used: L('오늘 광고 공격을 이미 받았어요'),
            sold_out: L('이번 주 구매 한도를 채웠어요'), medals: L('공성 훈장이 부족해요'), owned: L('이미 가지고 있어요'), max: L('최고 단계예요'), no_profile: L('먼저 닉네임을 정해 주세요'),
        }[e] || RaidOn.errText(e);
    },
};
