import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BeautyGoError, LOCALES, createBeautyGo, durationOf, formatDuration, formatPrice, nextSlot, offersOf, openingStatus,
  photosOf, priceOf, productsOf, resolveLocale, venueDay, venues,
} from '../src/index.js';

const KEY = 'bgo_pk_' + 'k'.repeat(32);

function fake(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

test('the key travels in a header, never in the URL', async () => {
  const { fetch, calls } = fake(200, { api_version: 'v1' });
  await createBeautyGo({ key: KEY, fetch, baseUrl: 'https://api.example/' }).site();
  assert.equal(calls[0].url, 'https://api.example/v1/site');
  assert.equal(calls[0].init.headers['X-BeautyGo-Key'], KEY);
  assert.ok(!calls[0].url.includes(KEY));
});

test('a key of the wrong shape is refused before any call', () => {
  assert.throws(() => createBeautyGo({ key: 'sk_live_oops' }), TypeError);
  assert.throws(() => createBeautyGo({}), TypeError);
});

test('slots: one day, or a range, never both', async () => {
  const { fetch, calls } = fake(200, { slots: [] });
  const bg = createBeautyGo({ key: KEY, fetch, baseUrl: 'https://api.example' });
  await bg.slots({ date: '2026-12-01', serviceId: 'svc-1' });
  assert.equal(calls[0].url, 'https://api.example/v1/site/slots?date=2026-12-01&service_id=svc-1');
  await bg.slots({ from: new Date('2026-12-01T10:00:00Z'), to: '2026-12-07' });
  assert.equal(calls[1].url, 'https://api.example/v1/site/slots?from=2026-12-01&to=2026-12-07');
  assert.throws(() => bg.slots({ date: '2026-12-01', from: '2026-12-01', to: '2026-12-02' }), TypeError);
  assert.throws(() => bg.slots({ date: 'tomorrow' }), TypeError);
});

test('an API refusal becomes a BeautyGoError with its code', async () => {
  const { fetch } = fake(403, { code: 'origin_not_allowed', message: 'nope' });
  await assert.rejects(createBeautyGo({ key: KEY, fetch }).site(), (error) => {
    assert.ok(error instanceof BeautyGoError);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'origin_not_allowed');
    return true;
  });
});

test('a network failure has its own code', async () => {
  const fetch = async () => {
    throw new Error('offline');
  };
  await assert.rejects(createBeautyGo({ key: KEY, fetch, retries: 0 }).hours(), (error) => error.code === 'network_error');
});

test('bookingUrl: null when booking is closed, service preselected otherwise', () => {
  const bg = createBeautyGo({ key: KEY, fetch: async () => ({}) });
  const open = {
    booking: { available: true, url: 'https://app.example/stylists/1' },
    services: [{ id: 'svc-1', booking_url: 'https://app.example/stylists/1?reserver=svc-1' }],
  };
  assert.equal(bg.bookingUrl(open), 'https://app.example/stylists/1');
  assert.equal(bg.bookingUrl(open, { serviceId: 'svc-1' }), 'https://app.example/stylists/1?reserver=svc-1');
  assert.equal(bg.bookingUrl(open, { serviceId: 'unknown' }), 'https://app.example/stylists/1');
  assert.equal(
    bg.bookingUrl(open, { serviceId: 'svc-1', slot: { date: '2026-12-01', start_time: '09:30' } }),
    'https://app.example/stylists/1?reserver=svc-1&jour=2026-12-01&heure=09%3A30',
  );
  assert.equal(bg.bookingUrl({ booking: { available: false, url: null }, services: [] }), null);
});

// ── Deep links (24/11/2026): the visitor never does twice what she did on the site ──

const DIRECT = 'https://beautygo-app.technas.fr/stylists/st-1';
const directSite = (type = 'pro') => ({
  provider: { type, contact_url: `${DIRECT}?ecrire=1&utm_source=site_relie` },
  booking: { available: true, url: `${DIRECT}?reserver=1&utm_source=site_relie` },
  services: [
    { id: 'svc-1', location_options: ['home', 'salon'], booking_url: `${DIRECT}?reserver=svc-1&utm_source=site_relie` },
    { id: 'svc-2', location_options: ['stylist_home'], booking_url: `${DIRECT}?reserver=svc-2&utm_source=site_relie` },
  ],
  gift_card: { available: true, reason: null, url: 'https://beautygo-app.technas.fr/offrir/@awa?utm_source=site_relie' },
});

test('venue: where the appointment takes place, when the service offers it', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const site = directSite();
  const lieu = (options) => new URL(bg.bookingUrl(site, options)).searchParams.get('lieu');
  assert.equal(lieu({ serviceId: 'svc-1', venue: 'home' }), 'domicile');
  assert.equal(lieu({ serviceId: 'svc-1', venue: 'salon' }), 'salon');
  assert.equal(lieu({ serviceId: 'svc-2', venue: 'salon' }), 'salon', 'her own place counts as "at a venue"');
  assert.equal(lieu({ serviceId: 'svc-2', venue: 'home' }), null, 'svc-2 is never at the client\'s');
  assert.equal(lieu({ serviceId: 'svc-1', venue: 'beach' }), null);
  // With a slot: the slot and the place, each once.
  const both = new URL(bg.bookingUrl(site, { serviceId: 'svc-1', venue: 'home', slot: { date: '2026-12-01', start_time: '09:30' } }));
  assert.equal(both.searchParams.get('reserver'), 'svc-1');
  assert.equal(both.searchParams.get('jour'), '2026-12-01');
  assert.equal(both.searchParams.getAll('lieu').length, 1);
  // Without a service: the choice of the service, the place kept for when she chooses.
  assert.equal(bg.bookingUrl(site), site.booking.url);
  assert.equal(lieu({ venue: 'home' }), 'domicile');
  // The cart's "Pay" with a service keeps the place too.
  assert.equal(new URL(bg.checkoutUrl({ ...site, products: [{ id: 'pr-1', available: true, max_quantity: 3 }] },
    { 'pr-1': 1 }, { serviceId: 'svc-1', venue: 'home' })).searchParams.get('lieu'), 'domicile');
  // A salon's booking has no place to choose.
  assert.equal(new URL(bg.bookingUrl(directSite('salon'), { serviceId: 'svc-1', venue: 'home' })).searchParams.get('lieu'), null);
});

test('giftCardUrl: her gift card page, this service already chosen', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const site = directSite();
  assert.equal(bg.giftCardUrl(site), site.gift_card.url);
  assert.equal(new URL(bg.giftCardUrl(site, { serviceId: 'svc-2' })).searchParams.get('prestation'), 'svc-2');
  assert.equal(bg.giftCardUrl(site, { serviceId: 'unknown' }), site.gift_card.url);
  assert.equal(bg.giftCardUrl({ ...site, gift_card: { available: false, reason: 'not_payable', url: null } }), null);
});

test('a salon: the booking link opens the salon page on the service and slot', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const url = 'https://beautygo-app.technas.fr/salons/salon-1';
  const site = {
    provider: { type: 'salon', team: [] },
    booking: { available: true, url: `${url}?utm_source=site_relie` },
    services: [{ id: 'gab-1', booking_url: `${url}?reserver=gab-1&utm_source=site_relie` }],
  };
  const lien = new URL(
    bg.bookingUrl(site, { serviceId: 'gab-1', slot: { date: '2026-12-01', start_time: '09:00', end_time: null } }),
  );
  assert.equal(lien.pathname, '/salons/salon-1');
  assert.equal(lien.searchParams.get('reserver'), 'gab-1');
  assert.equal(lien.searchParams.get('jour'), '2026-12-01');
  assert.equal(lien.searchParams.get('heure'), '09:00');
});

// ── Products and the cart (23/11/2026) ──────────────────────────────────────

const PAGE = 'https://beautygo-app.technas.fr/stylists/st-1';
const shopSite = () => ({
  provider: { type: 'pro' },
  booking: { available: true, url: `${PAGE}?utm_source=site_relie&utm_medium=salon.fr` },
  services: [{ id: 'svc-1', booking_url: `${PAGE}?reserver=svc-1&utm_source=site_relie&utm_medium=salon.fr` }],
  products: [
    { id: 'pr-1', name: 'Huile', price: 12.5, currency: 'EUR', available: true, max_quantity: 2 },
    { id: 'pr-2', name: 'Masque', price: 9.9, currency: 'EUR', available: true, max_quantity: 99 },
    { id: 'pr-3', name: 'Gel', price: 5, currency: 'EUR', available: false, max_quantity: 0 },
  ],
  shop: { available: true, cart_url: `${PAGE}?utm_source=site_relie&utm_medium=salon.fr` },
});

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

test('products() reads the products of the site', async () => {
  const { fetch, calls } = fake(200, shopSite());
  const products = await createBeautyGo({ key: KEY, fetch, baseUrl: 'https://api.example' }).products();
  assert.equal(calls[0].url, 'https://api.example/v1/site');
  assert.deepEqual(products.map((p) => p.id), ['pr-1', 'pr-2', 'pr-3']);
});

test('the cart is bounded by stock and refuses what is not for sale', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const cart = bg.cart(shopSite(), { storage: null });
  assert.equal(cart.add('pr-1', 5), 2); // max_quantity
  assert.equal(cart.add('pr-1'), 2);
  assert.equal(cart.add('pr-3'), 0); // sold out
  assert.equal(cart.add('unknown'), 0);
  assert.equal(cart.set('pr-2', 3), 3);
  assert.equal(cart.count, 5);
  assert.deepEqual(cart.totals, [{ currency: 'EUR', amount: 54.7 }]);
  assert.deepEqual(cart.items.map((i) => [i.product.name, i.quantity]), [['Huile', 2], ['Masque', 3]]);
  cart.set('pr-2', 0);
  assert.deepEqual(cart.lines(), [{ id: 'pr-1', quantity: 2 }]);
  cart.clear();
  assert.equal(cart.count, 0);
});

test('checkoutUrl opens the order in BeautyGo with the cart in it', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const cart = bg.cart(shopSite(), { storage: null });
  assert.equal(cart.checkoutUrl(), null); // empty
  cart.add('pr-1', 2);
  cart.add('pr-2');
  assert.equal(
    cart.checkoutUrl(),
    `${PAGE}?utm_source=site_relie&utm_medium=salon.fr&articles=pr-1:2,pr-2:1`,
  );
  // Without the cart helper: an object or an array works too, bounded the same way.
  assert.equal(
    bg.checkoutUrl(shopSite(), { 'pr-1': 9, 'pr-3': 1 }),
    `${PAGE}?utm_source=site_relie&utm_medium=salon.fr&articles=pr-1:2`,
  );
  assert.equal(bg.checkoutUrl(shopSite(), [{ productId: 'pr-3', quantity: 1 }]), null);
  const closed = { ...shopSite(), shop: { available: false, cart_url: null } };
  assert.equal(bg.checkoutUrl(closed, { 'pr-1': 1 }), null);
});

test('a service and its products on the same appointment', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const site = shopSite();
  const url = new URL(
    bg.bookingUrl(site, { serviceId: 'svc-1', slot: { date: '2026-12-01', start_time: '09:30' }, products: { 'pr-2': 2 } }),
  );
  assert.equal(url.searchParams.get('reserver'), 'svc-1');
  assert.equal(url.searchParams.get('heure'), '09:30');
  assert.equal(url.searchParams.get('articles'), 'pr-2:2');
  const cart = bg.cart(site, { storage: null });
  cart.add('pr-1');
  assert.equal(new URL(cart.checkoutUrl({ serviceId: 'svc-1' })).searchParams.get('reserver'), 'svc-1');
  // A salon sells products apart from bookings.
  const salon = { ...site, provider: { type: 'salon', team: [] } };
  assert.equal(new URL(bg.bookingUrl(salon, { serviceId: 'svc-1', products: { 'pr-2': 1 } })).searchParams.get('articles'), null);
});

test('the cart survives a reload and re-bounds on fresh data', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const storage = memoryStorage();
  const seen = [];
  const first = bg.cart(shopSite(), { storage });
  const stop = first.subscribe((c) => seen.push(c.count));
  first.add('pr-1', 2);
  first.add('pr-2', 4);
  stop();
  first.add('pr-2');
  assert.deepEqual(seen, [2, 6]);
  const again = bg.cart(shopSite(), { storage });
  assert.deepEqual(again.lines(), [{ id: 'pr-1', quantity: 2 }, { id: 'pr-2', quantity: 5 }]);
  const fresh = shopSite();
  fresh.products[0] = { ...fresh.products[0], available: false, max_quantity: 0 };
  fresh.products[1] = { ...fresh.products[1], max_quantity: 3 };
  again.refresh(fresh);
  assert.deepEqual(again.lines(), [{ id: 'pr-2', quantity: 3 }]);
});

test('on a server, the cart is never kept in a shared storage', () => {
  const bg = createBeautyGo({ key: KEY, fetch: fake(200, {}).fetch });
  const cart = bg.cart(shopSite());
  cart.add('pr-1');
  assert.equal(bg.cart(shopSite()).count, 0);
});

// ── 0.3.0: what a real website had to write by hand ──────────────────────────

/** Answers each call with the next response of the list (the last one repeats). */
function sequence(...responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const [status, body, headers = {}] = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (name) => headers[name] ?? null } };
  };
  return { fetch, calls };
}
const NOW = { 'Retry-After': '0' };

test('locales are a closed list, and a browser language resolves to one of them', async () => {
  assert.deepEqual([...LOCALES], ['fr', 'en', 'pt', 'es', 'de', 'it']);
  assert.equal(resolveLocale('pt-BR'), 'pt');
  assert.equal(resolveLocale('EN'), 'en');
  assert.equal(resolveLocale(['nl-NL', 'de-AT', 'fr']), 'de');
  assert.equal(resolveLocale('nl'), 'fr');
  assert.equal(resolveLocale(undefined, 'it'), 'it');
  assert.equal(resolveLocale('zz', 'zz'), 'fr');

  const { fetch, calls } = fake(200, {});
  const bg = createBeautyGo({ key: KEY, fetch, locale: 'pt-BR' });
  assert.equal(bg.locale, 'pt');
  await bg.site();
  assert.equal(calls[0].init.headers['Accept-Language'], 'pt');
  const unknown = createBeautyGo({ key: KEY, fetch, locale: 'nl' });
  assert.equal(unknown.locale, 'fr');
  const none = createBeautyGo({ key: KEY, fetch });
  assert.equal(none.locale, null);
  await none.site();
  assert.equal(calls[1].init.headers['Accept-Language'], undefined);
});

test('a busy API is asked again, and the page never sees it', async () => {
  const busy = sequence([429, { code: 'rate_limited' }, NOW], [200, { api_version: 'v1' }]);
  assert.deepEqual(await createBeautyGo({ key: KEY, fetch: busy.fetch }).site(), { api_version: 'v1' });
  assert.equal(busy.calls.length, 2);

  const stuck = sequence([429, null, NOW]);
  await assert.rejects(createBeautyGo({ key: KEY, fetch: stuck.fetch }).site(), (error) => error.code === 'rate_limited' && error.status === 429);
  assert.equal(stuck.calls.length, 3, 'two retries by default');

  const once = sequence([429, null, NOW]);
  await assert.rejects(createBeautyGo({ key: KEY, fetch: once.fetch, retries: 0 }).site(), (error) => error.code === 'rate_limited');
  assert.equal(once.calls.length, 1);
});

test('a refusal is an answer: it is never retried', async () => {
  const refused = sequence([403, { code: 'origin_not_allowed' }, NOW]);
  await assert.rejects(createBeautyGo({ key: KEY, fetch: refused.fetch }).site(), (error) => error.code === 'origin_not_allowed');
  assert.equal(refused.calls.length, 1);
});

test('a retry stops as soon as the caller aborts', async () => {
  const controller = new AbortController();
  const slow = sequence([503, null, { 'Retry-After': '5' }]);
  const pending = createBeautyGo({ key: KEY, fetch: slow.fetch }).site({ signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, (error) => error.code === 'network_error' && error.cause && error.cause.name === 'AbortError');
  assert.equal(slow.calls.length, 1);

  let tries = 0;
  const aborting = async () => {
    tries += 1;
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  };
  await assert.rejects(createBeautyGo({ key: KEY, fetch: aborting }).site(), (error) => error.code === 'network_error');
  assert.equal(tries, 1, 'an aborted call is not tried again');
});

test('slots: the next days from today at the venue', async () => {
  const { fetch, calls } = fake(200, { days: [] });
  const bg = createBeautyGo({ key: KEY, fetch, baseUrl: 'https://api.example' });
  await bg.slots({ days: 14, serviceId: 'svc-1' });
  assert.equal(calls[0].url, 'https://api.example/v1/site/slots?days=14&service_id=svc-1');
  for (const days of [0, 32, 1.5, 'a week']) assert.throws(() => bg.slots({ days }), TypeError);
  assert.throws(() => bg.slots({ days: 7, date: '2026-12-01' }), TypeError);
  assert.throws(() => bg.slots({ days: 7, from: '2026-12-01', to: '2026-12-02' }), TypeError);
  assert.throws(() => bg.slots({}), TypeError);
});

const WEEK = {
  monday: { enabled: true, ranges: [{ start: '14:00', end: '19:00' }, { start: '09:00', end: '12:00' }] },
  tuesday: { enabled: true, ranges: [{ start: '09:00', end: '19:00' }] },
  wednesday: { enabled: false, ranges: [{ start: '09:00', end: '19:00' }] },
  thursday: { enabled: true, ranges: [{ start: '10:00', end: '18:00' }] },
};
// 2026-11-23 is a Monday.
const at = (iso) => ({ timeZone: 'Europe/Paris', now: new Date(iso) });

test('openingStatus: open, later today, another day, never', () => {
  const hours = { schedule: WEEK };
  assert.deepEqual(openingStatus(hours, at('2026-11-23T09:30:00+01:00')), { open: true, closesAt: '12:00', opensAt: null, opensInDays: null, opensOn: null });
  assert.deepEqual(openingStatus(hours, at('2026-11-23T12:30:00+01:00')), { open: false, closesAt: null, opensAt: '14:00', opensInDays: 0, opensOn: 'monday' });
  assert.deepEqual(openingStatus(hours, at('2026-11-23T19:00:00+01:00')), { open: false, closesAt: null, opensAt: '09:00', opensInDays: 1, opensOn: 'tuesday' });
  // Tuesday evening: Wednesday is off, she opens on Thursday.
  assert.deepEqual(openingStatus(hours, at('2026-11-24T20:00:00+01:00')), { open: false, closesAt: null, opensAt: '10:00', opensInDays: 2, opensOn: 'thursday' });
  assert.equal(openingStatus({ schedule: {} }, at('2026-11-23T10:00:00+01:00')).opensAt, null);
  assert.equal(openingStatus(null), null);
  assert.equal(openingStatus({ schedule: null }), null);
});

test('the venue keeps its own day and hour, wherever the visitor is', () => {
  // 23:30 UTC on Monday is already Tuesday 00:30 in Paris, and still Monday 18:30 in Toronto.
  const now = new Date('2026-11-23T23:30:00Z');
  assert.equal(venueDay({ provider: { timezone: 'Europe/Paris' } }, now), '2026-11-24');
  assert.equal(venueDay('America/Toronto', now), '2026-11-23');
  assert.equal(openingStatus({ schedule: WEEK }, { timeZone: 'Europe/Paris', now }).opensOn, 'tuesday');
  assert.match(venueDay({ provider: { timezone: 'Nowhere/Unknown' } }, now), /^\d{4}-\d{2}-\d{2}$/);
});

test('nextSlot reads one day or a range', () => {
  assert.equal(nextSlot(null), null);
  assert.equal(nextSlot({ date: '2026-12-01', slots: [] }), null);
  assert.deepEqual(nextSlot({ date: '2026-12-01', slots: [{ start_time: '10:00' }] }), { date: '2026-12-01', slot: { start_time: '10:00' } });
  const range = { days: [{ date: '2026-12-01', slots: [] }, { date: '2026-12-02', slots: [{ start_time: '09:30' }, { start_time: '10:00' }] }] };
  assert.deepEqual(nextSlot(range), { date: '2026-12-02', slot: { start_time: '09:30' } });
  assert.equal(nextSlot({ days: [{ date: '2026-12-01', slots: [] }] }), null);
});

const LINKED = {
  services: [{ id: 's1', location_options: ['salon', 'home'] }, { id: 's2', location_options: ['salon'] }],
  portfolio: [{ url: 'a.jpg', service_ids: ['s1'] }, { url: 'b.jpg' }, { url: 'c.jpg', service_ids: ['s2', 's1'] }],
  products: [{ id: 'p1', service_ids: ['s2'] }, { id: 'p2', service_ids: [] }],
  offers: [{ id: 'o1', service_ids: [] }, { id: 'o2', service_ids: ['s2'] }],
};

test('what goes with a service: its photos, its products, its offers', () => {
  assert.deepEqual(photosOf(LINKED, 's1').map((p) => p.url), ['a.jpg', 'c.jpg']);
  assert.deepEqual(productsOf(LINKED, 's2').map((p) => p.id), ['p1']);
  assert.deepEqual(offersOf(LINKED, 's1').map((o) => o.id), ['o1']);
  assert.deepEqual(offersOf(LINKED, 's2').map((o) => o.id), ['o1', 'o2']);
  assert.deepEqual(photosOf(null, 's1'), []);
});

test('venues: at a salon, at home, or both', () => {
  assert.deepEqual(venues(LINKED), { salon: true, home: true });
  assert.deepEqual(venues({ services: [{ location_options: ['home'] }] }), { salon: false, home: true });
  assert.deepEqual(venues({ services: [{ location_options: ['stylist_home'] }, { location_options: null }] }), { salon: true, home: false });
  assert.deepEqual(venues(null), { salon: false, home: false });
});

test('a price and a duration: fixed or a range', () => {
  assert.deepEqual(priceOf({ price: 45, price_min: 45, price_max: 45, currency: 'EUR' }), { fixed: true, min: 45, max: 45, currency: 'EUR' });
  assert.deepEqual(priceOf({ price: null, price_min: 110, price_max: 150, currency: 'EUR' }), { fixed: false, min: 110, max: 150, currency: 'EUR' });
  assert.deepEqual(priceOf({ price: null, price_min: 5000, price_max: null, currency: 'XOF' }), { fixed: true, min: 5000, max: 5000, currency: 'XOF' });
  assert.equal(priceOf({ price: null, price_min: null, price_max: null }), null);
  assert.deepEqual(durationOf({ duration_minutes: 90 }), { fixed: true, min: 90, max: 90 });
  assert.deepEqual(durationOf({ duration_minutes: null, duration_min_minutes: 180, duration_max_minutes: 240 }), { fixed: false, min: 180, max: 240 });
  assert.equal(durationOf({}), null);
});

test('formatPrice and formatDuration write them the way a client reads them', () => {
  const plain = (text) => text.replace(/\s/g, ' ');
  assert.equal(plain(formatPrice(45, 'EUR', 'fr')), '45 €');
  assert.equal(plain(formatPrice(12.9, 'EUR', 'fr')), '12,90 €');
  assert.equal(plain(formatPrice(12.9, 'EUR', 'en')), '€12.90');
  assert.match(plain(formatPrice(5000, 'XOF', 'fr')), /^5 000 F CFA$/);
  assert.equal(formatPrice(null), '');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(95), '1 h 35');
  assert.equal(formatDuration(0), '');
});


test('the offers address clients formally unless the site asks for informal', async () => {
  const formal = fake(200, { api_version: 'v1' });
  const bg = createBeautyGo({ key: KEY, fetch: formal.fetch, baseUrl: 'https://api.example' });
  await bg.site();
  assert.equal(bg.register, 'formal');
  assert.equal(formal.calls[0].url, 'https://api.example/v1/site');
  const informal = fake(200, { api_version: 'v1' });
  await createBeautyGo({ key: KEY, fetch: informal.fetch, baseUrl: 'https://api.example', register: 'informal' }).site();
  assert.equal(informal.calls[0].url, 'https://api.example/v1/site?register=informal');
  assert.throws(() => createBeautyGo({ key: KEY, register: 'tu' }), TypeError);
});
