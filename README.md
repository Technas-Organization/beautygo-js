[Français](./README.fr.md)

# BeautyGo on your website

You are building the website of a beauty professional (hair, nails, lashes and more) or of a
beauty salon that uses BeautyGo. This package gives you their data, always up to date: profile,
live services and prices, opening hours, free slots, portfolio, reviews, offers, gift cards and
the products of their shop. You design everything, in your own design, on your own domain name.
No interface is imposed. It works with Next.js, React or plain JavaScript.

For online booking, your button opens the pro's BeautyGo booking flow, with the chosen service
already selected (the app if the client has it, the web otherwise). Account, payment and
reminders happen there. For products, your site has its own cart, and "Pay" opens the order in
BeautyGo with the cart already filled.

```bash
npm install @beautygo/site
```

## 1. The key

**To test right away**, without waiting for your client: use the demo key
`bgo_pk_test_uDyKYsZsv6Fu6bhif0XKUgrK`. It reads Studio Azur, a demo studio (services, hours,
slots, products including one sold out, "Book" and "Pay" open). It answers from your server and from any
page, even a file opened with a double click. Then switch to your client's key: the code does not change.

The pro links your site in the BeautyGo Pro app: **Profile, My website, Site built by a
developer**. They type the site's address and give you the key shown
(`bgo_pk_…`).

- The Essentiel plan or higher is required. You pay nothing.
- A pro has only one linked site. Linking another one replaces the first.
- The key is public. It only reads this pro. In a browser, it only answers from the linked
  domain (with or without `www`) and from `localhost` for development.

### A salon

For a salon, the owner links the site: **Salon, Profile, Site built by a
developer**. The salon's subscription must be active. The key has the same format, and so do
the responses, with three differences:

- `provider.type` is `salon` (`pro` for a pro), and `provider.team` lists the team
  (name, handle, photo, rating);
- `slots()` requires `serviceId`: in a salon, slots depend on who performs the
  service;
- `hours()` returns `no_salon_hours`: each pro on the team has their own hours.

"Book" opens the salon's page in BeautyGo, on the chosen service.

## 2. Next.js (App Router)

```js
// lib/beautygo.js
import { createBeautyGo } from '@beautygo/site';

export const beautygo = createBeautyGo({ key: process.env.NEXT_PUBLIC_BEAUTYGO_KEY });
```

```jsx
// app/page.jsx: server-side rendering, refreshed every 5 minutes
import { beautygo } from '@/lib/beautygo';

export default async function Page() {
  const site = await beautygo.site({ next: { revalidate: 300 } });
  return (
    <main>
      <h1>{site.provider.name}</h1>
      <p>{site.provider.bio}</p>

      <ul>
        {site.services.map((s) => (
          <li key={s.id}>
            {s.name} · {s.price ?? `${s.price_min} to ${s.price_max}`} {s.currency} · {s.duration_minutes} min
            {s.booking_url && <a href={s.booking_url}>Book</a>}
          </li>
        ))}
      </ul>

      {site.portfolio.map((p) => <img key={p.url} src={p.url} alt="" loading="lazy" />)}
    </main>
  );
}
```

Slots change quickly: read them in the browser.

```jsx
'use client';
import { useEffect, useState } from 'react';
import { beautygo } from '@/lib/beautygo';

export function Creneaux({ site, serviceId, jour }) {
  const [slots, setSlots] = useState(null);
  useEffect(() => {
    beautygo.slots({ date: jour, serviceId }).then((r) => setSlots(r.slots));
  }, [serviceId, jour]);
  if (!slots) return <p>Loading…</p>;
  if (slots.length === 0) return <p>No slots that day.</p>;
  // With the slot, booking already opens on this day and time.
  return (
    <ul>
      {slots.map((c) => (
        <li key={c.start_at ?? c.start_time}>
          <a href={beautygo.bookingUrl(site, { serviceId, slot: c })}>{c.start_time}</a>
        </li>
      ))}
    </ul>
  );
}
```

### Address, map and contact

`provider.address` is only filled for a salon that displays its address. `provider.location`
gives you what you need to place it on a map: exactly what the BeautyGo map shows to a
visitor. `precise` is `true` for a displayed salon; otherwise the point is the center of their
area (about 1 km): draw an area, not a pin. A pro who works from home is never located more
precisely. Phone number and email are never public. To contact the pro,
`provider.contact_url` opens a conversation with them in BeautyGo (the visitor signs in first
if they have no account, then the conversation opens on its own),
`provider.profile_url` opens their page, and `provider.social_links` gives their social networks. For a salon,
`contact_url` opens its conversation, and is `null` as long as the salon is not published.

### Products and the cart

`site.products` lists what their shop sells: name, brand, description, size, price and
currency, photos, `available` (on sale and in stock) and `max_quantity` (what one order can
take: the stock when it is tracked, 99 otherwise). For a salon, these are the products of the
team's pros. The list is empty when the shop is closed or paused.

The cart lives on your site. Nothing goes to BeautyGo before "Pay". The package caps it at the
stock and keeps it in the browser (`localStorage`, one cart per key).

```jsx
'use client';
import { useEffect, useState } from 'react';
import { beautygo } from '@/lib/beautygo';

export function Boutique({ site }) {
  const [panier] = useState(() => beautygo.cart(site));
  const [, rafraichir] = useState(0);
  useEffect(() => panier.subscribe(() => rafraichir((n) => n + 1)), [panier]);

  return (
    <>
      {site.products.map((p) => (
        <article key={p.id}>
          <img src={p.photo_url} alt="" />
          <h3>{p.name}</h3>
          <p>{p.price} {p.currency}</p>
          <button disabled={!p.available} onClick={() => panier.add(p.id)}>
            {p.available ? 'Add to cart' : 'Sold out'}
          </button>
          <a href={p.product_url}>View on BeautyGo</a>
        </article>
      ))}
      {panier.count > 0 && (
        <a href={panier.checkoutUrl()}>
          Pay {panier.totals.map((t) => `${t.amount} ${t.currency}`).join(' + ')}
        </a>
      )}
    </>
  );
}
```

"Pay" opens the order in BeautyGo with these products in it. BeautyGo checks prices and
stock again, asks for an account if needed, and the client chooses when to pick up the order
at the pro's, who confirms it. The client's own BeautyGo cart is not touched. For a salon whose
products come from several pros, they go into the client's BeautyGo cart, one order per pro.

A service and its products on the same appointment (a pro, not a salon):

```js
beautygo.bookingUrl(site, { serviceId, slot, products: panier });
// or, from the cart:
panier.checkoutUrl({ serviceId, slot });
```

Do you manage your own cart? `checkoutUrl(site, { [productId]: quantity })` returns the same
address, capped the same way.

### Offers and gift card

`site.offers` lists their current offers, the ones their BeautyGo page shows: loyalty,
off-peak hours, last minute, referral, coming as a group… Each one comes with its
promise already written, in the visitor's language (`title`, `sentence`, `conditions`),
the highest discount for a badge (`percent`) and the targeted services (`service_ids`).
Never write a discount yourself: the pro manages their offers in BeautyGo, which applies them
when the client books through `booking_url`. An off-peak or last-minute slot
carries its discount (`slot.discount_percent`), computed by BeautyGo: show "−15 %" on it.

`site.gift_card.url` opens their "Gift" page: someone pays for a service as a gift, and the person
who receives it books it later. `available` is false when the pro does not take payments online
(`reason` says why): hide the button then. On a service, `giftCardUrl(site,
{ serviceId })` opens the same page with this service already selected.

```jsx
{site.offers.map((o) => (
  <a key={o.id} href={o.booking_url ?? site.booking.url}>
    {o.percent && <strong>−{o.percent} %</strong>} {o.title}
    {o.conditions.map((c) => <small key={c}>{c}</small>)}
  </a>
))}
{site.gift_card.available && <a href={site.gift_card.url}>Gift a service</a>}
{site.gift_card.available && <a href={beautygo.giftCardUrl(site, { serviceId })}>Gift this one</a>}
```

## 3. The functions

| Function | What it returns |
|---|---|
| `site()` | `provider`, `services`, `products`, `portfolio`, `reviews`, `offers`, `gift_card`, `shop`, `booking` |
| `products()` | the products on sale (the same list as `site().products`) |
| `hours()` | the weekly opening hours (a pro) |
| `slots({ days })`, `slots({ date })` or `slots({ from, to })` | the free slots for the next days starting today in the salon's time zone, for one day, or for a range (31 days at most); `serviceId` sets the duration (required for a salon) |
| `bookingUrl(site, { serviceId, slot, venue, products })` | the address of your "Book" button: booking opens on this service (without a service, on the service choice), on this slot if you pass it, at this venue (`'salon'` or `'home'`) when the service is offered there, with these products if you pass them; `null` if booking is closed |
| `giftCardUrl(site, { serviceId })` | the address of "Gift this service": their gift card page, with this service selected; `null` if they do not sell gift cards |
| `cart(site)` | a cart for your site: `add`, `set`, `remove`, `clear`, `items`, `count`, `totals`, `subscribe`, `refresh(site)`, `checkoutUrl()` |
| `checkoutUrl(site, articles, { serviceId, slot, venue })` | the address of your "Pay" button: the order opens in BeautyGo with these products in it; `null` if nothing can be bought |

The types are in `src/index.d.ts`.

### Language: a closed list

BeautyGo answers in six languages, and no more: `fr`, `en`, `pt`, `es`, `de`, `it`. The
`Locale` type only accepts those, and `LOCALES` gives them at runtime (for your language menu).
To start from what the browser says, `resolveLocale` always returns a served language:

```js
import { LOCALES, createBeautyGo, resolveLocale } from '@beautygo/site';

const locale = resolveLocale(navigator.languages); // 'pt-BR' gives 'pt', 'nl' gives 'fr'
const bg = createBeautyGo({ key: 'bgo_pk_…', locale });
bg.locale; // the requested language
```

Service names, category labels (`category_label`), offers and
descriptions arrive in that language.

Offers are sentences written by BeautyGo ("−10 % à votre 3ᵉ visite", French for "10 % off your
3rd visit"). In languages with a formal and an informal "you", they address clients formally by
default, like a salon on its website. If your texts use the informal form, ask for offers in the
same register:

```js
const bg = createBeautyGo({ key: 'bgo_pk_…', locale, register: 'informal' }); // "à ta 3ᵉ visite"
```

### What you do not have to write

While building a real site with the package, these are the things we kept coding by hand. They are included.

| Need | In the package |
|---|---|
| A busy API (429) or a one-second outage | retried automatically, twice, following `Retry-After`; `retries: 0` turns it off |
| "Today" in the salon's time zone, not the visitor's | `slots({ days: 14 })`, `venueDay(site)`, `provider.timezone` |
| "Open until 7 pm", "Opens tomorrow at 9 am" | `openingStatus(hours, { timeZone: site.provider.timezone })` |
| The next free slot | `nextSlot(await bg.slots({ days: 14, serviceId }))` |
| A service's photo, products and offers | `service.photo_url`, `photosOf`, `productsOf`, `offersOf` |
| "At the salon", "At home", or both | `venues(site)` |
| "45 €", "from 110 € to 150 €", "1 h 30" | `priceOf`, `durationOf`, `formatPrice`, `formatDuration` |
| The readable name of a category | `service.category_label`, `service.sub_category_label`, `product.category_label` |
| A social network's icon | `provider.socials`: `[{ platform: 'instagram', url }]` |

```js
import { formatDuration, formatPrice, openingStatus, priceOf, venues } from '@beautygo/site';

const [site, hours] = await Promise.all([bg.site(), bg.hours()]);
const etat = openingStatus(hours, { timeZone: site.provider.timezone });
// { open: true, closesAt: '19:00' } or { open: false, opensAt: '09:00', opensInDays: 1, opensOn: 'tuesday' }

for (const s of site.services) {
  const prix = priceOf(s); // { fixed, min, max, currency }
  console.log(s.name, s.category_label, formatPrice(prix.min, prix.currency, bg.locale), formatDuration(s.duration_minutes));
}
venues(site); // { salon: true, home: true }
```

### Every button lands on the right screen

The visitor makes their choices on YOUR site. BeautyGo only opens at the last step, already filled in. Never send
them to the profile and make them start over.

| Your button | The address | What opens in BeautyGo |
|---|---|---|
| "Book" on a service | `bookingUrl(site, { serviceId })` | booking, with this service selected |
| "Book" after picking a slot | `bookingUrl(site, { serviceId, slot })` | the same, on this day and time |
| "Book" at home or at the salon | `bookingUrl(site, { serviceId, slot, venue: 'home' })` | the same, with this venue selected (if the service is offered there) |
| "Book" with products | `bookingUrl(site, { serviceId, slot, products })` | the same appointment, with its products |
| General "Book" (header, footer) | `bookingUrl(site)` | booking, on the service choice |
| "Pay" for the cart | `cart.checkoutUrl()` | the order, with the products in it |
| "Get the offer" on an offer | your own calendar first (`offersOf`, `slot.discount_percent`), then `bookingUrl`; or `offer.booking_url` | the offer's service, or the referral screen |
| "Gift" | `site.gift_card.url` | their gift card page |
| "Gift this service" | `giftCardUrl(site, { serviceId })` | the same page, with this service selected |
| "See reviews" | `provider.reviews_url` | their reviews (a pro or a salon) |
| "Message" | `provider.contact_url` | the conversation with them (the salon's conversation) |
| "See profile" | `provider.profile_url` | their profile |
| A product | `product.product_url` | the product page |

`bookingUrl(site)` without a service opens booking on the service choice (for a salon: its
list of services, or the booking flow when it has only one). Even better: let the visitor
choose their service and slot on YOUR site, then use `bookingUrl(site, { serviceId, slot })`.

## 4. Without the package

It is a plain HTTP API. The key goes in a header, never in the URL.

```bash
curl -H "X-BeautyGo-Key: bgo_pk_…" https://api-beautygo.technas.fr/v1/site
```

| Route | Parameters |
|---|---|
| `GET /v1/site` | none (products and `shop.cart_url` are included) |
| `GET /v1/site/hours` | none |
| `GET /v1/site/slots` | `days=14` (starting today in the salon's time zone), or `date=YYYY-MM-DD`, or `from` and `to`; `service_id` (required for a salon) |

"Pay" without the package: add `articles=<id>:<quantity>,<id>:<quantity>` to `shop.cart_url`
(60 lines at most, and 99 per line at most). With `reserver=<service>` as well (a service's
`booking_url`), the service and its products go on the same appointment.

The parameters BeautyGo reads on its addresses (what the package writes for you):

| Parameter | On | What opens |
|---|---|---|
| `reserver=<service>` | their profile, the salon's page | booking on this service |
| `reserver=1` | their profile, the salon's page | booking, on the service choice |
| `jour=YYYY-MM-DD&heure=HH:MM` | with `reserver=<service>` | this slot, selected if it is still free |
| `lieu=salon` or `lieu=domicile` | with `reserver=` (a pro) | this venue, if the service is offered there |
| `articles=<id>:<quantity>,…` | their profile, the salon's page | the order, with these products in it |
| `ecrire=1` | their profile, the salon's page | the conversation (sign-in first without an account) |
| `avis=1` | their profile, the salon's page | their reviews |
| `prestation=<id>` | their "Gift" page (`gift_card.url`) | this service selected |

Each one is used only once: when the visitor comes back to the profile, they do not land there again. An unknown
value (a removed service, `lieu=plage`) does nothing: the profile shows normally.

## 5. Errors

Every rejection returns `{ "code", "message" }`. The package throws a `BeautyGoError` with `status`
and `code`.

| Code | What happens |
|---|---|
| `missing_key`, `unknown_key` (401) | the key is missing, or the site was removed or replaced |
| `origin_not_allowed` (403) | the browser is not on the linked domain |
| `site_not_found` (404) | the pro's account is closed, or the salon is no longer published |
| `bad_request` (400) | the slot parameters need fixing |
| `service_required` (400) | a salon: pass `serviceId` to `slots()` |
| `no_salon_hours` (404) | a salon has no hours of its own |
| `rate_limited` (429) | too many calls: the package already retried twice; cache your pages |
| `unavailable` (503) | BeautyGo is not responding: the package already retried |
| `network_error` | no network, or the call was aborted (`error.cause`) |

The site never loses content. When booking closes, everything keeps
displaying: `booking.available` becomes `false`, the `booking_url` values become `null`, and
`booking.reason` says why:

- `paused`: the pro or the salon is taking a break. Write for example "Bookings paused";
- `closed`: their plan (or the salon's subscription) no longer covers online booking.
  Write for example "Book by phone".

## 6. With a coding assistant

The package ships a skill, `skills/site-de-salon/SKILL.md`: the steps a coding assistant
follows to build a salon's website right the first time. It says what to decide before writing
(logo, a single color, tone), which data feeds which section, where each button leads, and what to
check before saying "done".

```bash
# Copy the folder to where your coding assistant reads its skills:
cp -R node_modules/@beautygo/site/skills/site-de-salon <skills-folder>/
```

Then: "Build my salon's website with the @beautygo/site package and the site-de-salon skill."
The site you get by following it: https://beautygo.fr/demo/studio-azur/

## 7. What does not change

`/v1` only adds fields. A field is never removed or renamed without a `/v2`.
