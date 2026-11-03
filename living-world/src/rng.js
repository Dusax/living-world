// PRNG determinístico (mulberry32) com estado salvável.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.getState = () => a;
  f.setState = (s) => { a = s >>> 0; };
  return f;
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const range = (rng, lo, hi) => lo + rng() * (hi - lo);
