(function (host, factory) {
  const api = factory(host);
  if (typeof module === "object" && module.exports) module.exports = api;
  else host.WelinkTrendIndicatorCycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (host) {
  "use strict";

  /**
   * One indicator change per visible, uninterrupted interval. The page supplies
   * canAdvance (loading/menu/focus/drag guards) and calls sync when those change.
   * Manual indicator/view/range changes call reset. No overdue ticks are replayed.
   */
  function create(options) {
    if (!options || typeof options.advance !== "function") throw new TypeError("advance is required");
    const interval = Number.isFinite(options.intervalMs) && options.intervalMs > 0 ? options.intervalMs : 25000;
    const now = options.now || Date.now;
    const schedule = options.schedule || ((callback, delay) => host.setTimeout(callback, delay));
    const cancel = options.cancel || ((id) => host.clearTimeout(id));
    const doc = options.document === undefined ? host.document : options.document;
    const win = options.window === undefined ? host : options.window;
    const Observer = options.IntersectionObserver === undefined ? host.IntersectionObserver : options.IntersectionObserver;
    const section = options.section;
    let enabled = options.enabled !== false, destroyed = false, pageActive = true, visible = true, pending = false;
    let timer = null, nextAt = null, timerGeneration = 0, lastState = "", observer = null;
    const listeners = [];

    function report(error) {
      try { if (typeof options.onError === "function") options.onError(error); } catch {}
    }
    function reason() {
      if (destroyed) return "destroyed";
      if (!enabled) return "disabled";
      if (!pageActive || doc?.hidden) return "hidden";
      if (!visible) return "offscreen";
      if (pending) return "busy";
      try { if (options.canAdvance && !options.canAdvance()) return "blocked"; }
      catch (error) { report(error); return "blocked"; }
      return null;
    }
    function getState() {
      const currentReason = reason();
      return { enabled, paused: currentReason !== null, reason: currentReason, pending, nextAt };
    }
    function publish() {
      const state = getState(), signature = JSON.stringify(state);
      if (signature === lastState) return;
      lastState = signature;
      try { if (typeof options.onStateChange === "function") options.onStateChange(state); } catch (error) { report(error); }
    }
    function clear() {
      ++timerGeneration;
      if (timer !== null) cancel(timer);
      timer = null; nextAt = null;
    }
    function finish(error) {
      pending = false;
      if (error) report(error);
      if (!destroyed) sync();
    }
    function tick(generation) {
      if (destroyed || generation !== timerGeneration) return;
      timer = null; nextAt = null;
      if (reason()) { sync(); return; }
      pending = true; publish();
      let result;
      try { result = options.advance(); }
      catch (error) { finish(error); return; }
      if (result && typeof result.then === "function") Promise.resolve(result).then(() => finish(), finish);
      else finish();
    }
    function sync() {
      if (reason()) clear();
      else if (timer === null) {
        const generation = ++timerGeneration;
        nextAt = now() + interval;
        timer = schedule(() => tick(generation), interval);
      }
      publish();
    }
    function reset() { clear(); sync(); }
    function setEnabled(value) {
      const next = Boolean(value);
      if (enabled === next) { sync(); return; }
      enabled = next; reset();
    }
    function listen(target, type, callback, capture = false) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, callback, capture);
      listeners.push(() => target.removeEventListener(type, callback, capture));
    }
    function measure() {
      if (!section?.getBoundingClientRect) return;
      const bounds = section.getBoundingClientRect();
      const height = win?.innerHeight || doc?.documentElement?.clientHeight;
      const width = win?.innerWidth || doc?.documentElement?.clientWidth;
      visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0
        && (!height || bounds.top < height) && (!width || bounds.left < width);
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; clear();
      observer?.disconnect();
      listeners.forEach((remove) => remove());
      publish();
    }

    listen(doc, "visibilitychange", sync);
    listen(win, "pagehide", () => { pageActive = false; sync(); });
    listen(win, "pageshow", () => { pageActive = true; reset(); });
    if (section && typeof Observer === "function") {
      visible = false;
      observer = new Observer((entries) => {
        const entry = entries.find((item) => item.target === section);
        if (!entry || destroyed) return;
        visible = entry.isIntersecting === true && entry.intersectionRatio > 0;
        sync();
      }, { threshold: [0, 0.001] });
      observer.observe(section);
    } else if (section) {
      measure();
      const update = () => { measure(); sync(); };
      listen(win, "scroll", update, true);
      listen(win, "resize", update);
    }
    sync();
    return { sync, reset, setEnabled, getState, destroy };
  }

  return { create };
});
