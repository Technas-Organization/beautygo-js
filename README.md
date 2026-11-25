# BeautyGo sur ton site

Tu fais le site d'une pro de la beauté ou d'un salon qui utilise BeautyGo. Ce paquet te
donne ses données, toujours à jour : fiche, prestations et prix, horaires, créneaux libres,
portfolio, avis, et les articles de sa boutique. Tu dessines tout, sur ton nom de domaine.
Aucune interface n'est imposée.

Pour réserver, ton bouton ouvre la réservation BeautyGo de la pro, déjà sur la prestation
choisie (l'app si la cliente l'a, sinon le web) : le compte, le paiement et les rappels se
passent là. Pour les articles, ton site a son panier, et « Payer » ouvre la commande dans
BeautyGo, le panier déjà rempli.

```bash
npm install @beautygo/site
```

## 1. La clé

**Pour tester tout de suite**, sans attendre ta cliente : la clé de démonstration
`bgo_pk_test_uDyKYsZsv6Fu6bhif0XKUgrK`. Elle lit le Studio Azur, un studio de démonstration (prestations, horaires,
créneaux, articles, dont un épuisé, « Réserver » et « Payer » ouverts). Elle répond depuis ton serveur et depuis n'importe quelle
page, même un fichier ouvert d'un double clic. Ensuite, passe à la clé de ta cliente : le code ne change pas.

C'est la pro qui relie ton site, dans l'app BeautyGo Pro : **Profil, Mon site, Site fait
par un développeur**. Elle tape l'adresse du site et te donne la clé affichée
(`bgo_pk_…`).

- Il faut au moins la formule Essentiel. Rien à payer pour toi.
- Une pro a un seul site relié. En relier un autre remplace le premier.
- La clé est publique. Elle ne lit que cette pro. Dans un navigateur, elle ne répond que
  depuis le domaine relié (avec ou sans `www`) et depuis `localhost` pour développer.

### Un salon

Pour un salon, c'est la propriétaire qui relie le site : **Salon, Profil, Site fait par un
développeur**. Il faut que l'abonnement du salon soit actif. La clé a la même forme, et
les réponses aussi, avec trois différences :

- `provider.type` vaut `salon` (`pro` pour une pro), et `provider.team` liste l'équipe
  (nom, pseudo, photo, note) ;
- `slots()` demande `serviceId` : au salon, les créneaux dépendent de qui fait la
  prestation ;
- `hours()` répond `no_salon_hours` : chaque pro de l'équipe a ses horaires.

« Réserver » ouvre la page du salon dans BeautyGo, sur la prestation choisie.

## 2. Next.js (App Router)

```js
// lib/beautygo.js
import { createBeautyGo } from '@beautygo/site';

export const beautygo = createBeautyGo({ key: process.env.NEXT_PUBLIC_BEAUTYGO_KEY });
```

```jsx
// app/page.jsx : rendu côté serveur, rafraîchi toutes les 5 minutes
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
            {s.name} · {s.price ?? `${s.price_min} à ${s.price_max}`} {s.currency} · {s.duration_minutes} min
            {s.booking_url && <a href={s.booking_url}>Réserver</a>}
          </li>
        ))}
      </ul>

      {site.portfolio.map((p) => <img key={p.url} src={p.url} alt="" loading="lazy" />)}
    </main>
  );
}
```

Les créneaux changent vite : lis-les dans le navigateur.

```jsx
'use client';
import { useEffect, useState } from 'react';
import { beautygo } from '@/lib/beautygo';

export function Creneaux({ site, serviceId, jour }) {
  const [slots, setSlots] = useState(null);
  useEffect(() => {
    beautygo.slots({ date: jour, serviceId }).then((r) => setSlots(r.slots));
  }, [serviceId, jour]);
  if (!slots) return <p>Chargement…</p>;
  if (slots.length === 0) return <p>Aucun créneau ce jour-là.</p>;
  // Avec le créneau, la réservation s'ouvre déjà sur ce jour et cette heure.
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

### L'adresse, la carte et le contact

`provider.address` n'est rempli que pour un salon qui affiche son adresse. `provider.location`
donne de quoi la poser sur une carte : exactement ce que la carte de BeautyGo montre à une
visiteuse. `precise` vaut `true` pour un salon affiché ; sinon le point est le centre de sa
zone (environ 1 km) : dessine une zone, pas une épingle. Une pro qui reçoit chez elle n'est
jamais située plus finement. Le téléphone et l'e-mail ne sont jamais publics : pour la
contacter, `provider.contact_url` ouvre la discussion avec elle dans BeautyGo (la visiteuse se
connecte d'abord si elle n'a pas de compte, puis la discussion s'ouvre seule),
`provider.profile_url` sa page, et `provider.social_links` donne ses réseaux. Un salon :
`contact_url` ouvre sa conversation, et vaut `null` tant qu'il n'est pas publié.

### Les articles et le panier

`site.products` liste ce que sa boutique vend : nom, marque, description, contenance, prix et
devise, photos, `available` (en vente et en stock) et `max_quantity` (ce qu'une commande peut
prendre : son stock quand il est suivi, 99 sinon). Pour un salon, ce sont les articles des pros
de l'équipe. La liste est vide quand la boutique est fermée ou en pause.

Le panier vit sur ton site, rien ne part chez BeautyGo avant « Payer ». Le paquet le borne au
stock et le garde dans le navigateur (`localStorage`, un panier par clé).

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
            {p.available ? 'Ajouter au panier' : 'Épuisé'}
          </button>
          <a href={p.product_url}>Voir sur BeautyGo</a>
        </article>
      ))}
      {panier.count > 0 && (
        <a href={panier.checkoutUrl()}>
          Payer {panier.totals.map((t) => `${t.amount} ${t.currency}`).join(' + ')}
        </a>
      )}
    </>
  );
}
```

« Payer » ouvre la commande dans BeautyGo, ces articles dedans. BeautyGo relit les prix et le
stock, demande le compte si besoin, et la cliente choisit quand passer chercher sa commande
chez la pro, qui la confirme. Le panier BeautyGo de la cliente n'est pas touché. Pour un salon dont les
articles viennent de plusieurs pros, ils vont dans son panier BeautyGo, une commande par pro.

Une prestation et ses produits sur le même rendez-vous (une pro, pas un salon) :

```js
beautygo.bookingUrl(site, { serviceId, slot, products: panier });
// ou, depuis le panier :
panier.checkoutUrl({ serviceId, slot });
```

Tu gères ton panier toi-même ? `checkoutUrl(site, { [productId]: quantité })` rend la même
adresse, bornée de la même façon.

### Ses offres et sa carte cadeau

`site.offers` liste ses offres en cours, celles que sa page BeautyGo montre : fidélité,
heures creuses, dernière minute, parrainage, venir à plusieurs… Chacune arrive avec sa
promesse déjà écrite, dans la langue de la visiteuse (`title`, `sentence`, `conditions`),
la remise la plus forte pour un badge (`percent`) et les prestations visées (`service_ids`).
N'écris jamais une remise toi-même : la pro gère ses offres dans BeautyGo, qui les applique
quand la cliente réserve par `booking_url`. Un créneau d'heures creuses ou de dernière minute
porte sa remise (`slot.discount_percent`), calculée par BeautyGo : affiche « −15 % » dessus.

`site.gift_card.url` ouvre sa page « Offrir » : on y paie une prestation à offrir, la personne
qui la reçoit la réserve plus tard. `available` est faux quand elle n'encaisse pas en ligne
(`reason` dit pourquoi) : cache alors le bouton. Sur une prestation, `giftCardUrl(site,
{ serviceId })` ouvre la même page, cette prestation déjà cochée.

```jsx
{site.offers.map((o) => (
  <a key={o.id} href={o.booking_url ?? site.booking.url}>
    {o.percent && <strong>−{o.percent} %</strong>} {o.title}
    {o.conditions.map((c) => <small key={c}>{c}</small>)}
  </a>
))}
{site.gift_card.available && <a href={site.gift_card.url}>Offrir une prestation</a>}
{site.gift_card.available && <a href={beautygo.giftCardUrl(site, { serviceId })}>Offrir celle-ci</a>}
```

## 3. Les fonctions

| Fonction | Ce qu'elle rend |
|---|---|
| `site()` | `provider`, `services`, `products`, `portfolio`, `reviews`, `offers`, `gift_card`, `shop`, `booking` |
| `products()` | les articles en vente (la même liste que `site().products`) |
| `hours()` | les horaires de la semaine (une pro) |
| `slots({ days })`, `slots({ date })` ou `slots({ from, to })` | les créneaux libres des prochains jours à partir d'aujourd'hui au fuseau du salon, d'un jour, ou d'une plage (31 jours au plus) ; `serviceId` cale la durée (obligatoire pour un salon) |
| `bookingUrl(site, { serviceId, slot, venue, products })` | l'adresse de ton bouton « Réserver » : la réservation s'ouvre sur cette prestation (sans prestation, au choix de la prestation), sur ce créneau si tu le passes, à ce lieu (`'salon'` ou `'home'`) quand la prestation s'y fait, avec ces produits si tu en passes ; `null` si la réservation est fermée |
| `giftCardUrl(site, { serviceId })` | l'adresse de « Offrir cette prestation » : sa page de cartes cadeaux, cette prestation cochée ; `null` si elle ne vend pas de carte cadeau |
| `cart(site)` | un panier pour ton site : `add`, `set`, `remove`, `clear`, `items`, `count`, `totals`, `subscribe`, `refresh(site)`, `checkoutUrl()` |
| `checkoutUrl(site, articles, { serviceId, slot, venue })` | l'adresse de ton bouton « Payer » : la commande s'ouvre dans BeautyGo, ces articles dedans ; `null` si rien ne s'achète |

Les types sont dans `src/index.d.ts`.

### La langue : une liste fermée

BeautyGo répond en six langues, et pas une de plus : `fr`, `en`, `pt`, `es`, `de`, `it`. Le type
`Locale` n'accepte que celles-là, et `LOCALES` les donne à l'exécution (pour ton menu des langues).
Pour partir de ce que dit le navigateur, `resolveLocale` rend toujours une langue servie :

```js
import { LOCALES, createBeautyGo, resolveLocale } from '@beautygo/site';

const locale = resolveLocale(navigator.languages); // 'pt-BR' donne 'pt', 'nl' donne 'fr'
const bg = createBeautyGo({ key: 'bgo_pk_…', locale });
bg.locale; // la langue demandée
```

Les noms des prestations, les libellés de catégorie (`category_label`), les offres et les
présentations arrivent dans cette langue.

Les offres sont des phrases écrites par BeautyGo (« −10 % à votre 3ᵉ visite »). Elles vouvoient
les clientes par défaut, comme un salon sur son site. Si tes textes tutoient, demande-les au même
registre :

```js
const bg = createBeautyGo({ key: 'bgo_pk_…', locale, register: 'informal' }); // « à ta 3ᵉ visite »
```

### Ce que tu n'as pas à écrire

En faisant un vrai site avec le paquet, voici ce qu'on recodait à la main. C'est dedans.

| Besoin | Dans le paquet |
|---|---|
| Une API occupée (429) ou une coupure d'une seconde | réessayé tout seul, deux fois, en suivant `Retry-After` ; `retries: 0` pour le couper |
| « Aujourd'hui » au fuseau du salon, pas à celui de la visiteuse | `slots({ days: 14 })`, `venueDay(site)`, `provider.timezone` |
| « Ouvert jusqu'à 19 h », « Ouvre demain à 9 h » | `openingStatus(hours, { timeZone: site.provider.timezone })` |
| Le prochain créneau libre | `nextSlot(await bg.slots({ days: 14, serviceId }))` |
| La photo d'une prestation, ses produits, ses offres | `service.photo_url`, `photosOf`, `productsOf`, `offersOf` |
| « Au salon », « À domicile », ou les deux | `venues(site)` |
| « 45 € », « de 110 € à 150 € », « 1 h 30 » | `priceOf`, `durationOf`, `formatPrice`, `formatDuration` |
| Le nom lisible d'une catégorie | `service.category_label`, `service.sub_category_label`, `product.category_label` |
| L'icône d'un réseau social | `provider.socials` : `[{ platform: 'instagram', url }]` |

```js
import { formatDuration, formatPrice, openingStatus, priceOf, venues } from '@beautygo/site';

const [site, hours] = await Promise.all([bg.site(), bg.hours()]);
const etat = openingStatus(hours, { timeZone: site.provider.timezone });
// { open: true, closesAt: '19:00' } ou { open: false, opensAt: '09:00', opensInDays: 1, opensOn: 'tuesday' }

for (const s of site.services) {
  const prix = priceOf(s); // { fixed, min, max, currency }
  console.log(s.name, s.category_label, formatPrice(prix.min, prix.currency, bg.locale), formatDuration(s.duration_minutes));
}
venues(site); // { salon: true, home: true }
```

### Chaque bouton arrive au bon écran

La visiteuse choisit sur TON site ; BeautyGo ne s'ouvre qu'au dernier pas, déjà rempli. Ne l'envoie
jamais sur la fiche en lui laissant tout refaire.

| Ton bouton | L'adresse | Ce qui s'ouvre dans BeautyGo |
|---|---|---|
| « Réserver » sur une prestation | `bookingUrl(site, { serviceId })` | la réservation, cette prestation choisie |
| « Réserver » après un créneau | `bookingUrl(site, { serviceId, slot })` | la même, sur ce jour et cette heure |
| « Réserver » à domicile ou au salon | `bookingUrl(site, { serviceId, slot, venue: 'home' })` | la même, ce lieu choisi (si la prestation s'y fait) |
| « Réserver » avec des produits | `bookingUrl(site, { serviceId, slot, products })` | le même rendez-vous, ses produits dedans |
| « Réserver » général (en-tête, pied de page) | `bookingUrl(site)` | la réservation, au choix de la prestation |
| « Payer » le panier | `cart.checkoutUrl()` | la commande, les articles dedans |
| « En profiter » sur une offre | ton agenda d'abord (`offersOf`, `slot.discount_percent`), puis `bookingUrl` ; ou `offer.booking_url` | la prestation de l'offre, ou l'écran de parrainage |
| « Offrir » | `site.gift_card.url` | sa page de cartes cadeaux |
| « Offrir cette prestation » | `giftCardUrl(site, { serviceId })` | la même page, cette prestation cochée |
| « Voir les avis » | `provider.reviews_url` | ses avis (une pro ou un salon) |
| « Écrire » | `provider.contact_url` | la discussion avec elle (la conversation du salon) |
| « Voir la fiche » | `provider.profile_url` | sa fiche |
| Un produit | `product.product_url` | la fiche du produit |

`bookingUrl(site)` sans prestation ouvre la réservation au choix de la prestation (un salon : sa
liste de prestations, ou le tunnel quand il n'en a qu'une). Mieux encore : laisse la visiteuse
choisir sa prestation et son créneau sur TON site, puis `bookingUrl(site, { serviceId, slot })`.

## 4. Sans le paquet

C'est une API HTTP ordinaire. La clé va dans un en-tête, jamais dans l'adresse.

```bash
curl -H "X-BeautyGo-Key: bgo_pk_…" https://api-beautygo.technas.fr/v1/site
```

| Route | Paramètres |
|---|---|
| `GET /v1/site` | aucun (les articles et `shop.cart_url` y sont) |
| `GET /v1/site/hours` | aucun |
| `GET /v1/site/slots` | `days=14` (à partir d'aujourd'hui au fuseau du salon), ou `date=AAAA-MM-JJ`, ou `from` et `to` ; `service_id` (obligatoire pour un salon) |

« Payer » sans le paquet : ajoute `articles=<id>:<quantité>,<id>:<quantité>` à `shop.cart_url`
(60 lignes et 99 par ligne au plus). Avec `reserver=<prestation>` en plus (le `booking_url`
d'une prestation), la prestation et ses produits partent sur le même rendez-vous.

Les paramètres que BeautyGo lit sur ses adresses (ce que le paquet écrit pour toi) :

| Paramètre | Sur | Ce qui s'ouvre |
|---|---|---|
| `reserver=<prestation>` | sa fiche, la page du salon | la réservation sur cette prestation |
| `reserver=1` | sa fiche, la page du salon | la réservation, au choix de la prestation |
| `jour=AAAA-MM-JJ&heure=HH:MM` | avec `reserver=<prestation>` | ce créneau, coché s'il est encore libre |
| `lieu=salon` ou `lieu=domicile` | avec `reserver=` (une pro) | ce lieu, si la prestation s'y fait |
| `articles=<id>:<quantité>,…` | sa fiche, la page du salon | la commande, ces produits dedans |
| `ecrire=1` | sa fiche, la page du salon | la discussion (connexion d'abord sans compte) |
| `avis=1` | sa fiche, la page du salon | ses avis |
| `prestation=<id>` | sa page « Offrir » (`gift_card.url`) | cette prestation cochée |

Chacun ne sert qu'une fois : revenue sur la fiche, la visiteuse n'y retombe pas. Une valeur
inconnue (une prestation retirée, `lieu=plage`) ne fait rien : la fiche s'affiche normalement.

## 5. Les erreurs

Chaque refus rend `{ "code", "message" }`. Le paquet lève une `BeautyGoError` avec `status`
et `code`.

| Code | Ce qui se passe |
|---|---|
| `missing_key`, `unknown_key` (401) | la clé manque, ou le site a été retiré ou remplacé |
| `origin_not_allowed` (403) | le navigateur n'est pas sur le domaine relié |
| `site_not_found` (404) | le compte de la pro est fermé, ou le salon n'est plus publié |
| `bad_request` (400) | paramètres des créneaux à revoir |
| `service_required` (400) | un salon : passe `serviceId` à `slots()` |
| `no_salon_hours` (404) | un salon n'a pas d'horaires à lui |
| `rate_limited` (429) | trop d'appels : le paquet a déjà réessayé deux fois ; mets les pages en cache |
| `unavailable` (503) | BeautyGo ne répond pas : le paquet a déjà réessayé |
| `network_error` | pas de réseau, ou l'appel a été annulé (`error.cause`) |

Le site ne perd jamais de contenu. Quand la réservation se ferme, tout continue de
s'afficher : `booking.available` passe à `false`, les `booking_url` à `null`, et
`booking.reason` dit pourquoi :

- `paused` : la pro ou le salon fait une pause. Écris par exemple « Réservations en pause » ;
- `closed` : sa formule (ou l'abonnement du salon) ne couvre plus la réservation en ligne.
  Écris par exemple « Réservez par téléphone ».

## 6. Avec un assistant de code

Le paquet embarque un skill, `skills/site-de-salon/SKILL.md` : la marche à suivre pour qu'un assistant
de code fasse le site d'un salon du premier coup. Il dit quoi décider avant d'écrire
(logo, une seule couleur, ton), quelle donnée nourrit quelle section, où mène chaque bouton, et quoi
vérifier avant de dire « fini ».

```bash
# Copie le dossier là où ton assistant de code lit ses skills :
cp -R node_modules/@beautygo/site/skills/site-de-salon <dossier-des-skills>/
```

Puis : « Fais le site de mon salon avec le paquet @beautygo/site et le skill site-de-salon. »
Le site obtenu en le suivant : https://beautygo.fr/demo/studio-azur/

## 7. Ce qui ne change pas

`/v1` n'ajoute que des champs. Un champ n'est ni retiré ni renommé sans une `/v2`.
