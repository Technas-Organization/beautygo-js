import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BeautyGoError, createBeautyGo } from '../src/index.js';

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
  await assert.rejects(createBeautyGo({ key: KEY, fetch }).hours(), (error) => error.code === 'network_error');
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
