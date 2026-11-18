# BeautyGo sur ton site

Tu fais le site d'une pro de la beauté ou d'un salon qui utilise BeautyGo. Ce paquet te
donne ses données, toujours à jour : fiche, prestations et prix, horaires, créneaux libres,
portfolio, avis. Tu dessines tout, sur ton nom de domaine. Aucune interface n'est imposée.

Pour réserver, ton bouton ouvre la réservation BeautyGo de la pro, déjà sur la prestation
choisie (l'app si la cliente l'a, sinon le web) : le compte, le paiement et les rappels se
passent là.

```bash
npm install @beautygo/site
```

## 1. La clé

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

## 3. Les fonctions

| Fonction | Ce qu'elle rend |
|---|---|
| `site()` | `provider`, `services`, `portfolio`, `reviews`, `booking` |
| `hours()` | les horaires de la semaine (une pro) |
| `slots({ date })` ou `slots({ from, to })` | les créneaux libres d'un jour, ou d'une plage de 31 jours au plus ; `serviceId` cale la durée (obligatoire pour un salon) |
| `bookingUrl(site, { serviceId, slot })` | l'adresse de ton bouton « Réserver » : la réservation s'ouvre sur cette prestation, et sur ce créneau si tu le passes ; `null` si la réservation est fermée |

Les types sont dans `src/index.d.ts`.

## 4. Sans le paquet

C'est une API HTTP ordinaire. La clé va dans un en-tête, jamais dans l'adresse.

```bash
curl -H "X-BeautyGo-Key: bgo_pk_…" https://api-beautygo.technas.fr/v1/site
```

| Route | Paramètres |
|---|---|
| `GET /v1/site` | aucun |
| `GET /v1/site/hours` | aucun |
| `GET /v1/site/slots` | `date=AAAA-MM-JJ`, ou `from` et `to` ; `service_id` (obligatoire pour un salon) |

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
| `rate_limited` (429) | trop d'appels : mets les pages en cache |
| `unavailable` (503) | réessaie dans un instant |

Le site ne perd jamais de contenu. Quand la réservation se ferme, tout continue de
s'afficher : `booking.available` passe à `false`, les `booking_url` à `null`, et
`booking.reason` dit pourquoi :

- `paused` : la pro ou le salon fait une pause. Écris par exemple « Réservations en pause » ;
- `closed` : sa formule (ou l'abonnement du salon) ne couvre plus la réservation en ligne.
  Écris par exemple « Réservez par téléphone ».

## 6. Ce qui ne change pas

`/v1` n'ajoute que des champs. Un champ n'est ni retiré ni renommé sans une `/v2`.
