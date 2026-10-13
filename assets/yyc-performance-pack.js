/* YYC Smooth Performance Pack
   Lightweight progressive enhancement: no dependencies, no changes to auth/admin flows.
   Added-subtree work is deduplicated into one animation-frame batch so rapid render
   bursts do not repeatedly walk the same gallery/admin DOM.
*/
(function () {
  'use strict';

  if (window.__YYCSmoothPerformancePack) return;
  window.__YYCSmoothPerformancePack = true;

  var prioritySelector = 'header, nav, .topbar, .brand, #home, .hero, .hero-photo, .hero-media, .hero-logo';

  function isPriority(node) {
    if (!node || !node.closest) return false;
    if (node.hasAttribute('fetchpriority') && node.getAttribute('fetchpriority') === 'high') return true;
    if (node.hasAttribute('data-yyc-eager') || node.loading === 'eager') return true;
    return !!node.closest(prioritySelector);
  }

  function optimizeMedia(root) {
    if (!root || root.nodeType !== 1) return;

    var media = [];
    if (root.matches && root.matches('img, iframe')) media.push(root);
    if (root.querySelectorAll) {
      var found = root.querySelectorAll('img, iframe');
      for (var i = 0; i < found.length; i++) media.push(found[i]);
    }

    for (var j = 0; j < media.length; j++) {
      var item = media[j];
      if (item.dataset.yycPerformancePrepared === '1') continue;
      item.dataset.yycPerformancePrepared = '1';

      if (isPriority(item)) continue;

      if (!item.hasAttribute('loading')) item.setAttribute('loading', 'lazy');
      if (item.tagName === 'IMG' && !item.hasAttribute('decoding')) {
        item.setAttribute('decoding', 'async');
      }
      if (item.tagName === 'IMG' && !item.hasAttribute('fetchpriority')) {
        item.setAttribute('fetchpriority', 'low');
      }
    }
  }

  function init() {
    optimizeMedia(document.body || document.documentElement);

    if (!('MutationObserver' in window) || !document.body) return;
    var queued = false;
    var pending = new Set();

    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j] && added[j].nodeType === 1) pending.add(added[j]);
        }
      }
      if (queued || !pending.size) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        var batch = Array.from(pending);
        pending.clear();
        var candidates = new Set(batch);

        for (var k = 0; k < batch.length; k++) {
          var root = batch[k];
          if (!root || !root.isConnected) continue;

          /* If a newly-added ancestor is in this batch, it will scan this node too. */
          var parent = root.parentElement;
          var coveredByAncestor = false;
          while (parent) {
            if (candidates.has(parent)) {
              coveredByAncestor = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (!coveredByAncestor) optimizeMedia(root);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
