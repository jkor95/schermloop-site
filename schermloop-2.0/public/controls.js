'use strict';
// Werkt in zowel de browser als in Node.js-tests.
(function (root) {
  function identifyKey(event) {
    const target=event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName || ''))) return null;
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return null;
    const key=event.key;
    if (['ArrowRight','PageDown',' ','Enter'].includes(key)) return 'next';
    if (['ArrowLeft','PageUp','Backspace'].includes(key)) return 'previous';
    if (key==='Home') return 'first';
    if (key==='End') return 'last';
    if (key==='m' || key==='M') return 'toggle';
    if (key==='Escape') return 'automatic';
    return null;
  }
  function shouldResume(lastInteraction, now, timeoutMs=30*60*1000) {
    return Number.isFinite(lastInteraction) && lastInteraction > 0 &&
      Number.isFinite(now) && now-lastInteraction >= timeoutMs;
  }
  const controls={identifyKey,shouldResume};
  if (typeof module==='object' && module.exports) module.exports=controls;
  if (root) root.SchermLoopControls=controls;
})(typeof globalThis==='object' ? globalThis : null);
