'use strict';
// Friends (server: server/supabase/migrations/20261020000000_friends.sql): add by 닉네임#태그, requests, invites to a party raid / co-op room.
// The state is polled every 30s while the game is visible and online; new invites raise the banner (UI.friendInvite, js/ui/friends.js).
const Friends = {
    st: null,                      // last friend_state()
    seen: new Set(),               // invite ids already shown
    listeners: [],
    timer: null,
    onChange(fn) { this.listeners.push(fn); },
    offChange(fn) { this.listeners = this.listeners.filter(f => f !== fn); },
    emit() { for (const f of this.listeners) try { f(this.st); } catch (e) { } },
    call(fn, args) { return RaidOn.call(fn, args); },
    // incoming requests + live invites: the badge number
    isFriend(uid) { return !!(uid && this.st && this.st.friends.some(f => f.uid === uid)); },
    get badge() { return this.st ? this.st.incoming.length + this.st.invites.length : 0; },
    async refresh() {
        if (!Online.on || !Online.profile) return this.st;
        const r = await this.call('friend_state');
        if (r.error) return this.st;
        this.st = r;
        this.emit();
        for (const inv of r.invites) if (!this.seen.has(inv.id)) { this.seen.add(inv.id); if (typeof UI !== 'undefined' && UI.friendInvite) UI.friendInvite(inv); }
        return r;
    },
    // "닉네임#1234" -> request; the tag is the last 4 digits after #
    async request(text) {
        const m = /^(.+?)\s*#\s*(\d{4})$/.exec(String(text || '').trim());
        if (!m) return { error: 'format' };
        const r = await this.call('friend_request', { p_name: m[1].trim(), p_tag: m[2] });
        if (!r.error) await this.refresh();
        return r;
    },
    async respond(uid, accept) { const r = await this.call('friend_respond', { p_uid: uid, p_accept: !!accept }); await this.refresh(); return r; },
    async remove(uid) { const r = await this.call('friend_remove', { p_uid: uid }); await this.refresh(); return r; },
    invite(uid, kind, code) { return this.call('friend_invite', { p_uid: uid, p_kind: kind, p_code: code }); },
    async dismiss(id) { const r = await this.call('invite_dismiss', { p_id: id }); if (this.st) { this.st.invites = this.st.invites.filter(i => i.id !== id); this.emit(); } return r; },
    errText(e) {
        return {
            format: L('닉네임#태그 4자리로 입력해 주세요 (예: 치즈냥#1234)'), not_found: L('그런 냥이를 찾지 못했어요'), self: L('나 자신은 친구로 추가할 수 없어요'),
            already: L('이미 친구이거나 신청한 냥이예요'), full: L('친구가 가득 찼어요 (최대 {0}명)', (this.st && this.st.max) || 50),
            their_full: L('상대의 친구 목록이 가득 찼어요'), too_many: L('친구 신청이 너무 많아요. 잠시 후 다시 해 주세요'),
            not_friend: L('친구에게만 초대할 수 있어요'), invalid: L('지금은 초대할 수 없는 방이에요'),
        }[e] || RaidOn.errText(e);
    },
    start() {
        if (this.timer || typeof document === 'undefined') return;
        this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
    },
};
if (typeof Online !== 'undefined') Online.onChange(() => { if (Online.on) { Friends.start(); Friends.refresh(); } });
