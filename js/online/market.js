'use strict';
// 거래소 client (server: server/supabase/migrations/20261022000000_market.sql).
// Only gear the server minted (it.mid, from mail rewards) trades, for 거래 금화 kept on the server. The server checks
// everything again; this side keeps the bag in step: listed / sold gear leaves the bag, and on sync any minted gear the
// server says is no longer ours is dropped (an old copy kept on this device can't come back).
const Market = {
    gold: 0, cfg: null, mine: null,
    call(fn, args) { return RaidOn.call(fn, args); },
    req() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)); },
    tradeable(it) { return !!(it && it.mid); },
    // gear that can go on sale now: minted, unenhanced, not equipped, not bought on the market (bound)
    sellable(it) { return this.tradeable(it) && !it.enh && !isEquipped(it) && !this.bound(it); },
    bound(it) { const o = this.mine && this.mine.owned.find(x => x.mid === it.mid); return !!(o && o.traded > 0); },
    async wallet() { const r = await this.call('market_wallet'); if (!r.error) { this.gold = Number(r.gold) || 0; this.cfg = r.cfg; } return r; },
    async search(slot, grade, sort, page) {
        return this.call('market_search', { p_slot: slot || null, p_grade: grade === null || grade === undefined ? null : grade, p_sort: sort || 'new', p_page: page || 0 });
    },
    async sync() {
        const t0 = Date.now(), r = await this.call('market_mine');
        if (r.error) return r;
        this.mine = r; this.gold = Number(r.gold) || 0; this.cfg = r.cfg;
        const keep = new Set([...r.owned.map(x => x.mid), ...(r.pending || [])]), p = Save.p;
        const gone = p.items.filter(it => it.mid && !keep.has(it.mid) && (it.t || 0) < t0);   // gear claimed while the call ran stays
        if (gone.length) {
            for (const it of gone) if (isEquipped(it)) p.equip[it.slot] = null;
            p.items = p.items.filter(it => !gone.includes(it)); Save.save();
        }
        return r;
    },
    // price limits for a grade and what the seller gets back
    range(grade) { const c = this.cfg; return c ? { min: c.floor[grade], max: c.ceil[grade] } : null; },
    deposit(price) { return Math.max(1, Math.ceil(price * ((this.cfg && this.cfg.deposit) || 0.02))); },
    fee(price) { return Math.ceil(price * ((this.cfg && this.cfg.fee) || 0.05)); },
    // 착용 레벨 단계 of a listing / minted item (its level decides the tier, GEAR_TIERS in js/data/rules.js)
    tierOf(lv) { return tierForIlvl(Math.max(1, Math.round(Number(lv) || 1))); },
    // price help for the sell screen: the lowest open price of the same slot + grade, overall and in the same tier
    // (market_search sorted by price; up to 2 pages so a cheaper lower tier doesn't hide the tier's own lowest)
    async lowest(slot, grade, tier) {
        const out = { any: null, tier: null, n: 0 };
        for (let page = 0; page < 2; page++) {
            const r = await this.search(slot, grade, 'price', page);
            if (r.error) return page ? out : r;
            for (const row of r.rows) {
                const v = Number(row.price);
                if (out.any === null) out.any = v;
                if (this.tierOf(row.lv) === tier) { out.n++; if (out.tier === null) out.tier = v; }
            }
            if (out.tier !== null || r.rows.length < ((this.cfg && this.cfg.pageSize) || 20)) break;
        }
        return out;
    },
    // recent trades of the same slot + grade (market_price, migration 20261038000000). null when the server doesn't have it yet
    async prices(slot, grade) {
        const r = await this.call('market_price', { p_slot: slot, p_grade: grade });
        return r && !r.error && Array.isArray(r.trades) ? r.trades : null;
    },
    // what an open listing pays out when it sells: price - fee + the deposit back
    payout(price, deposit) { return price - this.fee(price) + (deposit === undefined ? this.deposit(price) : deposit); },
    async list(it, price) {
        Save.save(); await Online.pushSave(true);          // the server checks the item in the cloud copy (unenhanced, not equipped)
        const r = await this.call('market_list', { p_mid: it.mid, p_price: Math.round(price), p_req: this.req() });
        if (r.ok) {
            const p = Save.p; p.items = p.items.filter(x => x !== it); this.gold = Number(r.gold) || 0;
            Save.save(); await Online.pushSave(true);
        }
        return r;
    },
    async cancel(id) {
        const r = await this.call('market_cancel', { p_id: id, p_req: this.req() });
        if (r.ok && r.mail) await Online.claimMail(r.mail);   // the gear comes straight back
        return r;
    },
    async buy(row) {
        const r = await this.call('market_buy', { p_id: row.id, p_req: this.req() });
        if (r.ok) { this.gold = Number(r.gold) || 0; r.got = r.mail ? (await Online.claimMail(r.mail)) || [] : []; }
        return r;
    },
    errText(e) {
        return {
            no_profile: L('거래소는 닉네임이 있어야 쓸 수 있어요'), too_new: L('가입하고 {0}일이 지나야 거래할 수 있어요', (this.cfg && this.cfg.minAgeDays) || 3),
            low_stage: L('스테이지 {0}을(를) 깨면 거래할 수 있어요', ((this.cfg && this.cfg.minHighest) || 9) + 1), too_many: L('거래가 너무 잦아요. 잠시 후 다시 해 주세요'),
            not_owned: L('지금 가진 장비가 아니에요'), not_in_save: L('저장이 아직 반영되지 않았어요. 잠시 후 다시 해 주세요'), enhanced: L('강화한 장비는 팔 수 없어요'),
            equipped: L('장착 중인 장비는 팔 수 없어요'), bound: L('거래소에서 산 장비는 다시 팔 수 없어요'), price: L('가격이 허용 범위를 벗어났어요'),
            full: L('동시에 {0}개까지 팔 수 있어요', (this.cfg && this.cfg.maxListings) || 10), gold: L('거래 금화가 부족해요'), own: L('내가 올린 물건이에요'),
            gone: L('이미 팔렸거나 내려간 물건이에요'), not_found: L('물건을 찾지 못했어요'), pair_limit: L('같은 냥이와는 하루 {0}번까지 거래할 수 있어요', (this.cfg && this.cfg.pairPerDay) || 3),
            req: L('요청을 다시 보내 주세요'),
        }[e] || RaidOn.errText(e);
    },
};
if (typeof Online !== 'undefined') Online.onChange(() => { if (Online.on && !Market.synced) { Market.synced = true; Market.sync(); } });
