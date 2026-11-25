import 'whatwg-fetch';

/**
 * Legacy browser polyfills for iPad 2 (iOS 9.3.5 / Safari 9) and older tablets.
 * Covers runtime globals and standard built-in helpers missing on WebKit < 11.
 */
(function initLegacyCompat() {
  if (typeof window === 'undefined') return;

  const g = window as any;

  if (typeof g.globalThis === 'undefined') {
    g.globalThis = g;
  }

  if (typeof g.queueMicrotask !== 'function') {
    g.queueMicrotask = function queueMicrotaskPolyfill(cb: () => void) {
      Promise.resolve()
        .then(cb)
        .catch(function rethrowAsync(err) {
          setTimeout(function throwAsync() {
            throw err;
          }, 0);
        });
    };
  }

  if (typeof g.AbortController === 'undefined') {
    class LegacyAbortSignal {
      aborted = false;
      reason: any = undefined;
      onabort: ((ev?: any) => void) | null = null;
      private _listeners: Array<(ev?: any) => void> = [];

      addEventListener(type: string, fn: (ev?: any) => void) {
        if (type === 'abort' && typeof fn === 'function') {
          this._listeners.push(fn);
        }
      }
      removeEventListener(type: string, fn: (ev?: any) => void) {
        if (type === 'abort') {
          this._listeners = this._listeners.filter((l) => l !== fn);
        }
      }
      _triggerAbort(reason?: any) {
        if (this.aborted) return;
        this.aborted = true;
        this.reason = reason;
        const ev = { type: 'abort', target: this };
        if (typeof this.onabort === 'function') {
          try {
            this.onabort(ev);
          } catch {}
        }
        this._listeners.slice().forEach((fn) => {
          try {
            fn(ev);
          } catch {}
        });
      }
    }

    g.AbortSignal = LegacyAbortSignal;
    g.AbortController = class LegacyAbortController {
      signal = new LegacyAbortSignal();
      abort(reason?: any) {
        this.signal._triggerAbort(reason);
      }
    };
  }

  if (typeof g.URLSearchParams === 'undefined') {
    class LegacyURLSearchParams {
      private _entries: Array<[string, string]> = [];

      constructor(init?: string | Record<string, string> | Array<[string, string]>) {
        if (!init) return;
        if (typeof init === 'string') {
          const clean = init.charAt(0) === '?' ? init.slice(1) : init;
          if (!clean) return;
          clean.split('&').forEach((part) => {
            if (!part) return;
            const eqIdx = part.indexOf('=');
            const rawKey = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
            const rawVal = eqIdx >= 0 ? part.slice(eqIdx + 1) : '';
            const decode = (s: string) => {
              try {
                return decodeURIComponent(s.replace(/\+/g, ' '));
              } catch {
                return s;
              }
            };
            this._entries.push([decode(rawKey), decode(rawVal)]);
          });
        } else if (Array.isArray(init)) {
          init.forEach((pair) => {
            if (Array.isArray(pair) && pair.length >= 2) {
              this._entries.push([String(pair[0]), String(pair[1])]);
            }
          });
        } else if (typeof init === 'object') {
          Object.keys(init).forEach((k) => {
            this._entries.push([k, String((init as any)[k])]);
          });
        }
      }

      append(key: string, val: string) {
        this._entries.push([String(key), String(val)]);
      }
      delete(key: string) {
        const k = String(key);
        this._entries = this._entries.filter((e) => e[0] !== k);
      }
      get(key: string): string | null {
        const k = String(key);
        for (let i = 0; i < this._entries.length; i++) {
          if (this._entries[i][0] === k) return this._entries[i][1];
        }
        return null;
      }
      getAll(key: string): string[] {
        const k = String(key);
        return this._entries.filter((e) => e[0] === k).map((e) => e[1]);
      }
      has(key: string): boolean {
        return this.get(key) !== null;
      }
      set(key: string, val: string) {
        const k = String(key);
        const v = String(val);
        let replaced = false;
        const next: Array<[string, string]> = [];
        for (let i = 0; i < this._entries.length; i++) {
          if (this._entries[i][0] === k) {
            if (!replaced) {
              next.push([k, v]);
              replaced = true;
            }
          } else {
            next.push(this._entries[i]);
          }
        }
        if (!replaced) next.push([k, v]);
        this._entries = next;
      }
      forEach(cb: (value: string, key: string, parent: any) => void, thisArg?: any) {
        this._entries.forEach((e) => cb.call(thisArg, e[1], e[0], this));
      }
      keys() {
        return this._entries.map((e) => e[0])[Symbol.iterator]();
      }
      values() {
        return this._entries.map((e) => e[1])[Symbol.iterator]();
      }
      entries() {
        return this._entries.slice()[Symbol.iterator]();
      }
      [Symbol.iterator]() {
        return this.entries();
      }
      toString(): string {
        return this._entries
          .map((e) => `${encodeURIComponent(e[0])}=${encodeURIComponent(e[1])}`)
          .join('&');
      }
    }
    g.URLSearchParams = LegacyURLSearchParams;
  }

  if (typeof g.ResizeObserver === 'undefined') {
    g.ResizeObserver = class NoopResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (typeof g.IntersectionObserver === 'undefined') {
    g.IntersectionObserver = class NoopIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }

  if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
    (NodeList.prototype as any).forEach = Array.prototype.forEach;
  }

  if (typeof Element !== 'undefined') {
    if (!Element.prototype.matches) {
      Element.prototype.matches =
        (Element.prototype as any).webkitMatchesSelector ||
        (Element.prototype as any).msMatchesSelector ||
        function fallbackMatches(this: Element, selector: string) {
          const matches = (this.ownerDocument || document).querySelectorAll(selector);
          let i = matches.length;
          while (--i >= 0 && matches.item(i) !== this) {}
          return i > -1;
        };
    }
    if (!Element.prototype.closest) {
      Element.prototype.closest = function fallbackClosest(this: Element, selector: string) {
        let el: Element | null = this;
        while (el && el.nodeType === 1) {
          if (el.matches(selector)) return el;
          el = el.parentElement || (el.parentNode as Element | null);
        }
        return null;
      };
    }
  }

  if (typeof (String.prototype as any).replaceAll !== 'function') {
    (String.prototype as any).replaceAll = function replaceAllPolyfill(
      this: string,
      search: string | RegExp,
      replacement: string | ((...args: any[]) => string)
    ) {
      if (search instanceof RegExp) {
        if (!search.global) {
          throw new TypeError('replaceAll must be called with a global RegExp');
        }
        return this.replace(search, replacement as any);
      }
      return this.split(String(search)).join(String(replacement));
    };
  }

  if (typeof g.crypto !== 'undefined' && typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = function fallbackRandomUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
})();
