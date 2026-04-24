(() => {
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function quantize(v, step) {
    if (!step || step <= 0) return v;
    return Math.round(v / step) * step;
  }

  // Fast, stable, non-crypto hash -> uint32 (for color seeding).
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function hashToHue(str) {
    const h = fnv1a32(String(str ?? ""));
    return h % 360;
  }

  window.TezoTearsUtils = {
    clamp,
    quantize,
    fnv1a32,
    hashToHue,
  };
})();
