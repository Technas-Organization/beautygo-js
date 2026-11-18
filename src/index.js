// BeautyGo site SDK: read ONE professional's public page from your own website.
// No UI, no dependency. Works in the browser and on the server (Node 18+, Next.js).

const DEFAULT_BASE_URL = 'https://api-beautygo.technas.fr';
const KEY_HEADER = 'X-BeautyGo-Key';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
export function createBeautyGo({ key, baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl, locale } = {}) {
  if (typeof key !== 'string' || !key.startsWith('bgo_pk_')) {
    throw new TypeError('createBeautyGo: `key` must be your site key (it starts with "bgo_pk_").');
  }
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new TypeError('createBeautyGo: no `fetch` available. Pass one with the `fetch` option.');
  }
  const root = String(baseUrl).replace(/\/+$/, '');

  async function get(path, params, init) {
    const url = new URL(root + path);
    for (const [name, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    }
    const headers = { Accept: 'application/json', [KEY_HEADER]: key };
    if (locale) headers['Accept-Language'] = locale;
    let response;
    try {
      response = await doFetch(url.toString(), { ...init, method: 'GET', headers: { ...(init && init.headers), ...headers } });
    } catch (cause) {
      const error = new BeautyGoError(0, 'network_error', 'BeautyGo could not be reached.');
      error.cause = cause;
      throw error;
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

  return {
    /** The page: provider, services, portfolio, reviews, and where "Book" should send the visitor. */
    site: (init) => get('/v1/site', null, init),
    /** Weekly opening hours. */
    hours: (init) => get('/v1/site/hours', null, init),
    /**
     * Free slots. Pass `{ date }` for one day, or `{ from, to }` for a range (31 days at most).
     * `serviceId` sizes the slots to that service's duration.
     */
    slots({ date, from, to, serviceId } = {}, init) {
      const oneDay = date !== undefined && from === undefined && to === undefined;
      const range = date === undefined && from !== undefined && to !== undefined;
      if (!oneDay && !range) throw new TypeError('slots: pass either { date } or { from, to }.');
      const params = oneDay ? { date: day(date, 'date') } : { from: day(from, 'from'), to: day(to, 'to') };
      return get('/v1/site/slots', { ...params, service_id: serviceId }, init);
    },
    /**
     * The address your "Book" button should open. Add `serviceId` to open the booking
     * flow on that service, and `slot` (from `slots()`) to preselect its day and time.
     * Returns `null` when online booking is closed.
     */
    bookingUrl(site, { serviceId, slot } = {}) {
      const booking = site && site.booking;
      if (!booking || !booking.available || !booking.url) return null;
      if (!serviceId) return booking.url;
      const service = (site.services || []).find((s) => s.id === String(serviceId));
      if (!service || !service.booking_url) return booking.url;
      if (!slot || !slot.date || !slot.start_time) return service.booking_url;
      const url = new URL(service.booking_url);
      url.searchParams.set('jour', slot.date);
      url.searchParams.set('heure', slot.start_time);
      return url.toString();
    },
  };
}
