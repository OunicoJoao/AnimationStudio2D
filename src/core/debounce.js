/** Atrasa a execução até `ms` sem novas chamadas. Tem `.flush()` e `.cancel()`. */
export function debounce(fn, ms) {
  let t = null, lastArgs = null;
  const run = () => { t = null; const a = lastArgs; lastArgs = null; fn(...(a || [])); };
  const d = (...args) => { lastArgs = args; clearTimeout(t); t = setTimeout(run, ms); };
  d.flush = () => { if (t) { clearTimeout(t); run(); } };
  d.cancel = () => { clearTimeout(t); t = null; lastArgs = null; };
  d.pending = () => t !== null;
  return d;
}
