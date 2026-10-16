'use strict';
// Cat theme details added after a screen is built: ears on top of the big panels and popups, a faint paw-print
// pattern behind panel contents, paw marks before headings, and a gold cat-ear ring around hero portraits.
// Pure decoration (pointer-events: none), safe to call any number of times on the same DOM.
(function () {
    const ear = side => { const e = document.createElement('div'); e.className = 'cat-ear ' + side; return e; };

    // ears sit on the panel's top edge; the panel scrolls (overflow) so they live in its parent at the panel's position
    const EAR_W = 52, EAR_IN = 64, EAR_UP = 30;
    function earsFor(panel) {
        const host = panel.parentElement;
        if (!host || !panel.offsetWidth) return;
        if (panel._ears) panel._ears.forEach(e => e.remove());
        const l = ear('l'), r = ear('r');
        // The ears are placed from the MIDDLE of the host outwards (left: calc(50% +- n)), never from its left edge:
        // the panels are horizontally centred in their host, so the pair stays symmetric whatever the width is.
        // Only the panel's size is measured, and client rects are converted back to the host's own CSS px with k
        // (#app is transform: scale()d to fit the window, and popups carry zoom: 1.15 on phones - offsetWidth
        // would miss the zoom, a raw client rect would miss the scale).
        const place = () => {
            const b = panel.getBoundingClientRect(), hb = host.getBoundingClientRect();
            if (!b.width || !hb.width) return;
            const k = host.offsetWidth / hb.width;
            const w = b.width * k, half = w / 2 - EAR_IN;
            l.style.left = 'calc(50% - ' + half + 'px)';                 // = centre - w/2 + EAR_IN
            r.style.left = 'calc(50% + ' + (half - EAR_W) + 'px)';        // = centre + w/2 - EAR_IN - EAR_W
            // vertical: panels are not always centred (.panel.win is pinned by top/bottom), so measure the top edge
            const y = (b.top - hb.top) * k;
            l.style.top = r.style.top = (y - EAR_UP) + 'px';
        };
        place();
        host.insertBefore(l, panel.nextSibling); host.insertBefore(r, panel.nextSibling);   // over the frame edge
        panel._ears = [l, r];
        // popups keep growing while pictures and fonts load, which used to leave the ears behind
        if (window.ResizeObserver) {
            if (panel._earRO) panel._earRO.disconnect();
            panel._earRO = new ResizeObserver(() => requestAnimationFrame(place));
            panel._earRO.observe(panel);
        }
    }

    function catDecor(scope) {
        scope = scope || (typeof UI !== 'undefined' && UI.root && UI.root());
        if (!scope) return;
        scope.querySelectorAll('.panel.win').forEach(p => {
            earsFor(p);
            if (!p.querySelector(':scope > .paw-bg')) { const bg = document.createElement('div'); bg.className = 'paw-bg'; p.prepend(bg); }
        });
        scope.querySelectorAll('.dim > .paper.modal').forEach(m => earsFor(m));
        scope.querySelectorAll('.portrait').forEach(p => p.classList.add('cat-frame'));
    }

    // modal() in core.js does not run the hub fit pass: decorate popups once they are laid out
    new MutationObserver(muts => {
        for (const m of muts) for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.classList.contains('dim')) requestAnimationFrame(() => catDecor(n));
            else if (n.classList.contains('portrait') || (n.querySelector && n.querySelector('.portrait'))) {
                (n.classList.contains('portrait') ? [n] : n.querySelectorAll('.portrait')).forEach(p => p.classList.add('cat-frame'));
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', () => requestAnimationFrame(() => catDecor()));
    if (typeof UI !== 'undefined') UI.catDecor = catDecor;
})();
