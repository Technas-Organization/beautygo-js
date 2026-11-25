// BeautyGo site SDK: read ONE professional's (or salon's) public page from your own website,
// sell her products with your own cart, and send the visitor to BeautyGo to book or pay.
// No UI, no dependency. Works in the browser and on the server (Node 18+, Next.js).

const DEFAULT_BASE_URL = 'https://api-beautygo.technas.fr';
const KEY_HEADER = 'X-BeautyGo-Key';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** What one BeautyGo order accepts: 60 lines, 99 of each at most. */
const MAX_LINES = 60;
const MAX_QUANTITY = 99;
/** A busy or briefly unavailable API is asked again; anything else is an answer. */
const RETRIED = new Set([429, 502, 503, 504]);
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const INTL = { fr: 'fr-FR', en: 'en-GB', pt: 'pt-PT', es: 'es-ES', de: 'de-DE', it: 'it-IT' };

/** The languages BeautyGo answers in. Any other language is served in French. */
export const LOCALES = Object.freeze(['fr', 'en', 'pt', 'es', 'de', 'it']);

/**
 * The language to ask for, from whatever a browser or a visitor gives you:
 * `resolveLocale(navigator.languages)`, `resolveLocale('pt-BR')` gives `'pt'`.
 * Returns `fallback` (French by default) when none of them is served.
 */
export function resolveLocale(input, fallback = 'fr') {
  for (const item of Array.isArray(input) ? input : [input]) {
    const code = String(item ?? '').trim().slice(0, 2).toLowerCase();
    if (LOCALES.includes(code)) return code;
  }
  return LOCALES.includes(fallback) ? fallback : 'fr';
}

function bounded(quantity, max) {
  const n = Math.floor(Number(quantity));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max, MAX_QUANTITY);
}

/** `id:quantity,…`, the form BeautyGo reads in `articles=`. */
function articlesParam(lines) {
  return lines
    .filter((l) => PRODUCT_ID.test(l.id) && l.quantity > 0)
    .slice(0, MAX_LINES)
    .map((l) => `${l.id}:${Math.min(l.quantity, MAX_QUANTITY)}`)
    .join(',');
}

/**
 * Where the visitor wants the appointment, as BeautyGo reads it (`lieu=`): `salon` covers her
 * salon and her own place, `home` is at the client's.
 */
const VENUE_PARAM = { salon: 'salon', home: 'domicile' };
const VENUE_OPTIONS = { salon: ['salon', 'stylist_home'], home: ['home'] };

function withParam(url, name, value) {
  const next = new URL(url);
  next.searchParams.set(name, value);
  return next.toString();
}

/** Adds `lieu=` when the service (or, without one, any service) takes place there. */
function withVenue(url, site, service, venue) {
  const param = VENUE_PARAM[venue];
  const isSalon = Boolean(site && site.provider && site.provider.type === 'salon');
  if (!url || !param || isSalon) return url; // a salon's booking has no place to choose
  const options = service
    ? service.location_options || []
    : ((site && site.services) || []).flatMap((s) => s.location_options || []);
  return options.some((o) => VENUE_OPTIONS[venue].includes(o)) ? withParam(url, 'lieu', param) : url;
}

function withArticles(url, lines) {
  const articles = articlesParam(lines);
  if (!url || !articles) return url || null;
  return `${url}${url.includes('?') ? '&' : '?'}articles=${articles}`;
}

/**
 * Normalize what a caller passes as a cart: a Cart, an array of `{ id | productId, quantity }`,
 * or an object `{ [productId]: quantity }`. Keeps only products of `site` that are for sale,
 * bounded by their `max_quantity`.
 */
function linesOf(site, items) {
  const products = new Map(((site && site.products) || []).map((p) => [p.id, p]));
  let raw = [];
  if (items && typeof items.lines === 'function') raw = items.lines();
  else if (Array.isArray(items)) raw = items.map((i) => ({ id: String(i.id ?? i.productId ?? ''), quantity: i.quantity ?? 1 }));
  else if (items && typeof items === 'object') raw = Object.entries(items).map(([id, quantity]) => ({ id, quantity }));
  const merged = new Map();
  for (const { id, quantity } of raw) {
    const product = products.get(id);
    if (!product || !product.available) continue;
    const q = bounded((merged.get(id) || 0) + Number(quantity), product.max_quantity ?? MAX_QUANTITY);
    if (q > 0) merged.set(id, q);
  }
  return [...merged].map(([id, quantity]) => ({ id, quantity })).slice(0, MAX_LINES);
}

function defaultStorage() {
  // A browser only: on a server, one storage would be shared by every visitor.
  try {
    return typeof window === 'object' && window && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // blocked storage (private mode, sandboxed iframe)
  }
}

/** An error returned by the API: `status` (HTTP) and `code` (stable, safe to branch on). */
export class BeautyGoError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = 'BeautyGoError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Create a client for the site linked to `key`.
 * The key is public: it only reads the professional who linked your site,
 * and browsers are only served from the linked domain (or localhost).
 */
export function createBeautyGo({ key, baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl, locale, retries = 2, register = 'formal' } = {}) {
  if (typeof key !== 'string' || !key.startsWith('bgo_pk_')) {
    throw new TypeError('createBeautyGo: `key` must be your site key (it starts with "bgo_pk_").');
  }
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new TypeError('createBeautyGo: no `fetch` available. Pass one with the `fetch` option.');
  }
  const root = String(baseUrl).replace(/\/+$/, '');
  // One of LOCALES, whatever was passed (`pt-BR`, `EN`); `null` lets BeautyGo answer in French.
  const language = locale === undefined || locale === null || locale === '' ? null : resolveLocale(locale);
  const attempts = Math.max(0, Math.min(Math.floor(Number(retries)) || 0, 5));
  // How BeautyGo's own sentences (the offers) address your clients: `formal` ("vous", "Sie") or `informal` ("tu", "du").
  if (register !== 'formal' && register !== 'informal') {
    throw new TypeError('createBeautyGo: `register` must be "formal" or "informal".');
  }
  // Formal is what BeautyGo answers by default: the URL only carries the other one.
  const siteParams = register === 'informal' ? { register } : null;

  function networkError(cause) {
    const error = new BeautyGoError(0, 'network_error', 'BeautyGo could not be reached.');
    error.cause = cause;
    return error;
  }
  /** Waits `ms`, unless the caller aborts in the meantime. */
  function pause(ms, signal) {
    return new Promise((resolve, reject) => {
      const aborted = () => (signal && signal.reason) || Object.assign(new Error('Aborted'), { name: 'AbortError' });
      if (signal && signal.aborted) return reject(aborted());
      const stop = () => {
        clearTimeout(timer);
        reject(aborted());
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', stop);
        resolve();
      }, ms);
      if (signal) signal.addEventListener('abort', stop, { once: true });
    });
  }
  /** What the server asks for (`Retry-After`, in seconds), else 0.6 s, then 1.2 s, then 2.4 s… */
  function delayBefore(attempt, response) {
    const said = response && response.headers && typeof response.headers.get === 'function'
      ? Number.parseFloat(response.headers.get('Retry-After'))
      : Number.NaN;
    if (Number.isFinite(said) && said >= 0) return Math.min(said * 1000, 8000);
    return 600 * 2 ** attempt;
  }

  async function get(path, params, init) {
    const url = new URL(root + path);
    for (const [name, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    }
    const headers = { Accept: 'application/json', [KEY_HEADER]: key };
    if (language) headers['Accept-Language'] = language;
    const request = { ...init, method: 'GET', headers: { ...(init && init.headers), ...headers } };
    let response;
    // A read is safe to repeat: a busy API (429) or a network hiccup is retried, the page never sees it.
    for (let attempt = 0; ; attempt += 1) {
      let failure = null;
      try {
        response = await doFetch(url.toString(), request);
      } catch (cause) {
        failure = cause;
      }
      const aborted = Boolean(failure && (failure.name === 'AbortError' || (request.signal && request.signal.aborted)));
      const again = !aborted && attempt < attempts && (failure ? true : RETRIED.has(response.status));
      if (!again) {
        if (failure) throw networkError(failure);
        break;
      }
      try {
        await pause(delayBefore(attempt, failure ? null : response), request.signal);
      } catch (cause) {
        throw networkError(cause);
      }
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const code = (body && body.code) || (response.status === 429 ? 'rate_limited' : 'unexpected_response');
      throw new BeautyGoError(response.status, code, body && body.message);
    }
    return body;
  }

  function day(value, name) {
    const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '');
    if (!DAY.test(text)) throw new TypeError(`${name} must be a day like "2026-12-01".`);
    return text;
  }

  /**
   * The address of the "Pay" button: BeautyGo opens the order with these products in it
   * (prices and stock read again there). The visitor's own BeautyGo cart is left as it is.
   * With `serviceId`, the service and the products go on the same appointment (a professional only).
   * Returns `null` when nothing in `items` can be bought.
   */
  function checkoutUrl(site, items, { serviceId, slot, venue } = {}) {
    const lines = linesOf(site, items);
    if (!lines.length) return null;
    const isSalon = site && site.provider && site.provider.type === 'salon';
    const service = serviceOf(site, serviceId);
    if (service && service.booking_url && !isSalon) {
      const booking = bookingUrl(site, { serviceId, slot, venue });
      if (booking) return withArticles(booking, lines);
    }
    const shop = site && site.shop;
    if (!shop || !shop.available || !shop.cart_url) return null;
    return withArticles(shop.cart_url, lines);
  }

  function serviceOf(site, serviceId) {
    if (!serviceId) return null;
    return ((site && site.services) || []).find((s) => s.id === String(serviceId)) || null;
  }

  function bookingUrl(site, { serviceId, slot, products, venue } = {}) {
    const booking = site && site.booking;
    if (!booking || !booking.available || !booking.url) return null;
    const service = serviceOf(site, serviceId);
    // No service (or an unknown one): BeautyGo opens the booking flow on the choice of the service.
    if (!service || !service.booking_url) return withVenue(booking.url, site, null, venue);
    let url = service.booking_url;
    if (slot && slot.date && slot.start_time) {
      const withSlot = new URL(url);
      withSlot.searchParams.set('jour', slot.date);
      withSlot.searchParams.set('heure', slot.start_time);
      url = withSlot.toString();
    }
    url = withVenue(url, site, service, venue);
    // A salon does not take products with a booking: they are sold by each team member.
    const isSalon = site.provider && site.provider.type === 'salon';
    return products && !isSalon ? withArticles(url, linesOf(site, products)) : url;
  }

  /**
   * The address of "Offer this service": her gift card page in BeautyGo, with this service
   * already chosen when she offers it. Without `serviceId`, the page itself.
   * Returns `null` when gift cards are not on sale.
   */
  function giftCardUrl(site, { serviceId } = {}) {
    const gift = site && site.gift_card;
    if (!gift || !gift.available || !gift.url) return null;
    const service = serviceOf(site, serviceId);
    return service ? withParam(gift.url, 'prestation', service.id) : gift.url;
  }

  /**
   * A cart kept on your website: nothing is sent to BeautyGo until `checkoutUrl()`.
   * Quantities never exceed a product's `max_quantity`; a product that is not for sale is refused.
   * In a browser it survives a reload (localStorage, one cart per key); pass `storage: null` to keep it in memory.
   */
  function cart(site, { storage = defaultStorage(), storageKey } = {}) {
    let current = site;
    let lines = [];
    const listeners = new Set();
    const keyName = storageKey || `beautygo.cart.${key.slice(-12)}`;

    function save() {
      if (!storage) return;
      try {
        storage.setItem(keyName, JSON.stringify(lines));
      } catch {
        // storage full or blocked: the cart still works for this page
      }
    }
    function changed() {
      save();
      for (const listener of listeners) listener(api);
    }
    function product(id) {
      return ((current && current.products) || []).find((p) => p.id === String(id));
    }
    function setLine(id, quantity) {
      const p = product(id);
      const q = p && p.available ? bounded(quantity, p.max_quantity ?? MAX_QUANTITY) : 0;
      const at = lines.findIndex((l) => l.id === String(id));
      if (q === 0) {
        if (at >= 0) lines.splice(at, 1);
      } else if (at >= 0) {
        lines[at] = { id: String(id), quantity: q };
      } else if (lines.length < MAX_LINES) {
        lines.push({ id: String(id), quantity: q });
      } else {
        return 0;
      }
      changed();
      return q;
    }

    if (storage) {
      try {
        const saved = JSON.parse(storage.getItem(keyName) || '[]');
        if (Array.isArray(saved)) lines = linesOf(current, saved);
      } catch {
        lines = [];
      }
    }

    const api = {
      /** Each line with its product (as `site()` returned it) and quantity. */
      get items() {
        return lines.map((l) => ({ product: product(l.id), quantity: l.quantity })).filter((i) => i.product);
      },
      /** Number of units in the cart. */
      get count() {
        return lines.reduce((n, l) => n + l.quantity, 0);
      },
      /** Totals per currency, e.g. `[{ currency: 'EUR', amount: 23.4 }]` (rounded to the cent). */
      get totals() {
        const sums = new Map();
        for (const { product: p, quantity } of api.items) {
          if (typeof p.price !== 'number' || !p.currency) continue;
          sums.set(p.currency, (sums.get(p.currency) || 0) + p.price * quantity);
        }
        return [...sums].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
      },
      lines: () => lines.map((l) => ({ ...l })),
      quantityOf: (id) => (lines.find((l) => l.id === String(id)) || { quantity: 0 }).quantity,
      /** Adds `quantity` (1 by default). Returns the quantity now in the cart, 0 if it cannot be bought. */
      add: (id, quantity = 1) => setLine(id, api.quantityOf(id) + bounded(quantity, MAX_QUANTITY)),
      /** Sets the quantity (0 removes). Returns the quantity kept, bounded by stock. */
      set: (id, quantity) => setLine(id, quantity),
      remove: (id) => void setLine(id, 0),
      clear() {
        lines = [];
        changed();
      },
      /** Re-bounds the cart on fresh data from `site()`: sold-out or removed products leave it. */
      refresh(freshSite) {
        current = freshSite;
        lines = linesOf(current, lines);
        changed();
        return api;
      },
      /** Called after every change. Returns a function that stops listening. */
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      /** The "Pay" address for this cart (see `checkoutUrl`). */
      checkoutUrl: (options) => checkoutUrl(current, lines, options),
    };
    return api;
  }

  return {
    /** The language asked for (one of `LOCALES`), `null` when none was given. */
    locale: language,
    /** How the offers address your clients: `formal` or `informal`. */
    register,
    /** The page: provider, services, products, portfolio, reviews, and where "Book" should send the visitor. */
    site: (init) => get('/v1/site', siteParams, init),
    /** The products for sale (the same list as `site().products`). */
    products: (init) => get('/v1/site', siteParams, init).then((s) => (s && s.products) || []),
    /** Weekly opening hours. */
    hours: (init) => get('/v1/site/hours', null, init),
    /**
     * Free slots. Pass `{ days }` for the next days from today at the venue (the usual case),
     * `{ date }` for one day, or `{ from, to }` for a range (31 days at most).
     * `serviceId` sizes the slots to that service's duration.
     */
    slots({ date, from, to, days, serviceId } = {}, init) {
      const oneDay = date !== undefined && from === undefined && to === undefined && days === undefined;
      const range = date === undefined && from !== undefined && to !== undefined && days === undefined;
      const next = days !== undefined && date === undefined && from === undefined && to === undefined;
      if (!oneDay && !range && !next) throw new TypeError('slots: pass { days }, { date } or { from, to }.');
      let params;
      if (next) {
        const count = Number(days);
        if (!Number.isInteger(count) || count < 1 || count > 31) throw new TypeError('slots: `days` goes from 1 to 31.');
        params = { days: count };
      } else {
        params = oneDay ? { date: day(date, 'date') } : { from: day(from, 'from'), to: day(to, 'to') };
      }
      return get('/v1/site/slots', { ...params, service_id: serviceId }, init);
    },
    /**
     * The address your "Book" button should open: BeautyGo opens the booking flow on the choice
     * of the service. Add `serviceId` to open it on that service, `slot` (from `slots()`) to
     * preselect its day and time, `venue` (`'salon'` or `'home'`) to preselect where, when the
     * service takes place there, and `products` (a cart, or `{ [productId]: quantity }`) to add
     * products to the appointment. Returns `null` when online booking is closed.
     */
    bookingUrl,
    checkoutUrl,
    giftCardUrl,
    cart,
  };
}

// ── Helpers every website ends up writing ────────────────────────────────────
// Pure functions: no call, no state. Import only the ones you use.

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

function clockAt(timeZone, now) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  let format;
  try {
    format = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timeZone || undefined });
  } catch {
    format = new Intl.DateTimeFormat('en-CA', options); // unknown zone: the visitor's own
  }
  const part = Object.fromEntries(format.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${part.year}-${part.month}-${part.day}`, weekday: part.weekday.toLowerCase(), minutes: Number(part.hour) * 60 + Number(part.minute) };
}

/**
 * Today at the venue, as `YYYY-MM-DD`: a visitor in Montréal still sees the salon's own day.
 * Pass the site (its `provider.timezone` is used) or a time zone name.
 */
export function venueDay(siteOrTimeZone, now = new Date()) {
  const zone = typeof siteOrTimeZone === 'string' ? siteOrTimeZone : siteOrTimeZone && siteOrTimeZone.provider && siteOrTimeZone.provider.timezone;
  return clockAt(zone, now).day;
}

/**
 * Is she open right now? From `hours()` and the venue's time zone (`site.provider.timezone`).
 * Open: `{ open: true, closesAt: '19:00' }`. Closed: `{ open: false, opensAt: '09:00', opensInDays: 1, opensOn: 'monday' }`
 * (`opensInDays` 0 = later today; `opensAt` null = closed all week). `null` when there is no schedule (a salon).
 */
export function openingStatus(hours, { timeZone, now = new Date() } = {}) {
  const schedule = hours && hours.schedule;
  if (!schedule || typeof schedule !== 'object') return null;
  const at = clockAt(timeZone, now);
  const today = WEEKDAYS.indexOf(at.weekday);
  const rangesOf = (offset) => {
    const d = schedule[WEEKDAYS[(today + offset) % 7]];
    if (!d || !d.enabled) return [];
    return (d.ranges || []).filter((r) => r && r.start && r.end).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  };
  const closed = { open: false, closesAt: null, opensAt: null, opensInDays: null, opensOn: null };
  const current = rangesOf(0).find((r) => minutesOf(r.start) <= at.minutes && at.minutes < minutesOf(r.end));
  if (current) return { ...closed, open: true, closesAt: current.end };
  const later = rangesOf(0).find((r) => minutesOf(r.start) > at.minutes);
  if (later) return { ...closed, opensAt: later.start, opensInDays: 0, opensOn: WEEKDAYS[today] };
  for (let offset = 1; offset <= 7; offset += 1) {
    const first = rangesOf(offset)[0];
    if (first) return { ...closed, opensAt: first.start, opensInDays: offset, opensOn: WEEKDAYS[(today + offset) % 7] };
  }
  return closed;
}

/** The first free slot of a `slots()` answer (one day or a range): `{ date, slot }`, or `null`. */
export function nextSlot(answer) {
  if (!answer) return null;
  if (Array.isArray(answer.slots)) return answer.slots.length ? { date: answer.date ?? answer.slots[0].date ?? null, slot: answer.slots[0] } : null;
  for (const d of answer.days || []) {
    if (d.slots && d.slots.length) return { date: d.date, slot: d.slots[0] };
  }
  return null;
}

/** The portfolio photos that show this service. */
export function photosOf(site, serviceId) {
  return ((site && site.portfolio) || []).filter((p) => (p.service_ids || []).includes(String(serviceId)));
}

/** The shop products that go with this service. */
export function productsOf(site, serviceId) {
  return ((site && site.products) || []).filter((p) => (p.service_ids || []).includes(String(serviceId)));
}

/** The offers that apply to this service: hers on every service, and those limited to it. */
export function offersOf(site, serviceId) {
  return ((site && site.offers) || []).filter((o) => !(o.service_ids || []).length || o.service_ids.includes(String(serviceId)));
}

/** Where she works, all services together: at a venue (`salon`), at the client's (`home`), or both. */
export function venues(site) {
  const all = new Set(((site && site.services) || []).flatMap((s) => s.location_options || []));
  return { salon: all.has('salon') || all.has('stylist_home'), home: all.has('home') };
}

/**
 * What a service costs: `{ fixed, min, max, currency }` (`fixed` false = "from min to max").
 * `null` when no price is set.
 */
export function priceOf(service) {
  if (!service) return null;
  const currency = service.currency || null;
  if (typeof service.price === 'number') return { fixed: true, min: service.price, max: service.price, currency };
  const min = typeof service.price_min === 'number' ? service.price_min : service.price_max;
  const max = typeof service.price_max === 'number' ? service.price_max : service.price_min;
  if (typeof min !== 'number') return null;
  return { fixed: min === max, min, max, currency };
}

/** How long a service takes, in minutes: `{ fixed, min, max }`, or `null`. */
export function durationOf(service) {
  if (!service) return null;
  if (service.duration_minutes) return { fixed: true, min: service.duration_minutes, max: service.duration_minutes };
  const min = service.duration_min_minutes || service.duration_max_minutes;
  const max = service.duration_max_minutes || service.duration_min_minutes;
  return min ? { fixed: min === max, min, max } : null;
}

/** `45 €`, `12,90 €`, `5 000 F CFA`: the currency's own decimals, none when the amount is whole. */
export function formatPrice(amount, currency = 'EUR', locale = 'fr') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  const whole = Math.round(amount) === amount;
  try {
    return new Intl.NumberFormat(INTL[locale] || locale, {
      style: 'currency',
      currency: currency || 'EUR',
      ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(amount);
  } catch {
    return `${amount} ${currency || ''}`.trim();
  }
}

/** `45 min`, `1 h`, `1 h 30`. */
export function formatDuration(minutes) {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
