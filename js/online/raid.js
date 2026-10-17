'use strict';
// Online raids (server: server/supabase/migrations/20261018000000_raid.sql, plan: docs/PLAN_ONLINE_RAID.md).
// Party raid and world boss runs are the 보스 토벌전 battle; the server counts a try when the run begins and adds the points on submit.
// Every call returns the server's jsonb, or { error } (network / not online / the server's own error code).
const RaidOn = {
    st: null,                      // last raid_state()
    async call(fn, args) {
        if (!Online.on) return { error: 'offline' };
        const { data, error } = await Online.sb.rpc(fn, args || {});
        if (error) { console.warn(fn, error.message); return { error: /function .* does not exist|schema cache/.test(error.message || '') ? 'no_server' : 'net' }; }
        return data || { error: 'net' };
    },
    async state() { const r = await this.call('raid_state'); if (!r.error) this.st = r; return r; },
    party(diff) { return this.st && (this.st.parties || []).find(p => p.diff === diff) || null; },
    claimed(mode, diff) { return !!(this.st && (this.st.claims || []).some(c => c.mode === mode && c.diff === diff)); },
    diffOpen(diff) { return this.st ? this.st.highest >= RAID_ON.diffs[diff].eq : false; },
    // the world boss card difficulty: the highest one this player's progress opens
    worldDiff() { let d = 0; RAID_ON.diffs.forEach((x, i) => { if (this.st && this.st.highest >= x.eq) d = i; }); return d; },
    // run points from damage: the 보스 토벌전 reference of that boss at that strength (Meta.raidRef) = 100
    points(kind, si, dmg) { return Math.max(0, Math.round(dmg / Meta.raidRef(kind, si) * 100)); },
    // world boss strength: this player's own progress (like 보스 토벌전), never below the boss's own stage
    worldStage(kind) { const p = Save.p; let hi = 0; for (const k in p.stars) if (p.stars[k] > 0) hi = Math.max(hi, +k); return Math.max(RAID.bossStage[kind] || 0, hi); },

    partyCreate(diff) { return this.call('party_create', { p_diff: diff }); },
    partyJoin(code) { return this.call('party_join', { p_code: code }); },
    partyQuick(diff) { return this.call('party_quick', { p_diff: diff }); },
    partyLeave(id) { return this.call('party_leave', { p_id: id }); },
    partyBegin(id) { return this.call('party_begin', { p_id: id }); },
    partySubmit(id, pts) { return this.call('party_submit', { p_id: id, p_pts: pts }); },
    worldBegin() { return this.call('world_begin'); },
    worldSubmit(pts) { return this.call('world_submit', { p_pts: pts }); },
    coopCreate(diff) { return this.call('coop_create', { p_diff: diff }); },
    coopJoin(code) { return this.call('coop_join', { p_code: code }); },
    coopQuick(diff) { return this.call('coop_quick', { p_diff: diff }); },
    coopRoom(id) { return this.call('coop_room', { p_id: id }); },
    coopSet(id, action) { return this.call('coop_set', { p_id: id, p_action: action }); },
    coopFinish(id, win, waves) { return this.call('coop_finish', { p_id: id, p_win: !!win, p_waves: waves | 0 }); },
    // pick one of four cards; the reward (card + medals) arrives as mail and is claimed right away
    async flip(mode, ref, pick) {
        const r = await this.call('raid_flip', { p_mode: mode, p_ref: ref || 0, p_pick: pick });
        if (r.error) return r;
        if (this.st) (this.st.claims = this.st.claims || []).push({ mode, diff: r.diff });
        if (this.st && this.st.pity) { this.st.pity.leg = r.leg; this.st.pity.myth = r.myth; }
        await Online.refreshMail();
        r.got = r.mail ? (await Online.claimMail(r.mail)) || [] : [];
        return r;
    },
    errText(e) {
        return {
            offline: L('온라인 연결이 필요합니다'), net: L('서버에 연결하지 못했어요'), no_server: L('서버 점검 중이에요. 잠시 후 다시 시도해 주세요'),
            no_profile: L('먼저 닉네임을 정해 주세요'), locked: L('진행도가 부족해요'), in_party: L('이번 주 이 난이도 파티에 이미 들어가 있어요'),
            full: L('파티가 가득 찼어요'), cleared: L('이미 처치한 파티예요'), invalid: L('코드를 다시 확인해 주세요'), contributed: L('보스에게 피해를 준 뒤에는 나갈 수 없어요'),
            no_tries: L('오늘 도전 횟수를 다 썼어요'), no_run: L('도전 기록을 찾지 못했어요'), not_cleared: L('아직 보스를 처치하지 못했어요'),
            claimed: L('이번 주 보상을 이미 받았어요'), own_room: L('내가 만든 방이에요'), state: L('지금은 할 수 없어요'), not_member: L('파티원이 아니에요'),
        }[e] || L('잠시 후 다시 시도해 주세요');
    },
};
