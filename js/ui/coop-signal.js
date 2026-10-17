'use strict';
// UI - 협동 디펜스 quick signals: a horn button in the battle top bar opens six short calls; they go to the partner over
// the co-op channel (Coop.signal, 'sig' message) and show as a speech bubble on both screens. Screen only: the battle never sees them.
(() => {
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const root = (...a) => UI.root(...a);
    const SIGNALS = [
        { id: 'help', icon: 'i_heart', text: () => L('도와줘!') },
        { id: 'boss', icon: 'i_skull', text: () => L('보스 온다!') },
        { id: 'here', icon: 'i_rally', text: () => L('영웅 이쪽으로!') },
        { id: 'wait', icon: 'i_pause', text: () => L('잠깐만, 금화 모을게') },
        { id: 'nice', icon: 'i_star', text: () => L('잘했어!') },
        { id: 'thanks', icon: 'i_medal', text: () => L('고마워!') },
    ];
    let bar = null;

    function closeBar() { if (bar) { bar.remove(); bar = null; } }
    function coopSignalBtn() {
        return h('div.iconbtn', { title: L('신호'), onclick: e => { e.stopPropagation(); click(); bar ? closeBar() : openBar(); } }, img('i_horn'));
    }
    function openBar() {
        closeBar();
        bar = h('div.paper.co-sig-bar', { style: { position: 'absolute', top: '62px', right: '12px', zIndex: 40, padding: '8px', display: 'grid',
            gridTemplateColumns: 'repeat(2, auto)', gap: '6px' } },
            SIGNALS.map(s => h('button.btn.small', { style: { display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-start' }, onclick: e => {
                e.stopPropagation();
                if (!Coop.signal(s.id)) { toast(L('잠시 후에 다시 보낼 수 있어요')); return; }
                click(); closeBar(); coopSignalShow(L('나'), s.id, true);
            } }, img(s.icon, '.icon'), s.text())));
        root().appendChild(bar);
    }
    // the bubble: the partner's signals stay longer and ring
    function coopSignalShow(name, id, mine) {
        const s = SIGNALS.find(x => x.id === id);
        if (!s || !Game.battle || !Game.battle.coop) return;
        document.querySelectorAll('.co-sig-bubble' + (mine ? '.mine' : '.mate')).forEach(e => e.remove());
        const b = h('div.paper.co-sig-bubble' + (mine ? '.mine' : '.mate'), { style: { position: 'absolute', top: mine ? '120px' : '64px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 41, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: mine ? '18px' : '22px', pointerEvents: 'none',
            color: mine ? '' : '#1d5a9a', maxWidth: 'calc(100% - 32px)' } },
            img(s.icon, '.icon'), h('b', name + ': '), s.text());
        root().appendChild(b);
        if (!mine && typeof Sfx !== 'undefined' && Sfx.play) Sfx.play('coin');
        setTimeout(() => b.remove(), mine ? 1600 : 3200);
    }

    Object.assign(UI, { coopSignalBtn, coopSignalShow });
})();
