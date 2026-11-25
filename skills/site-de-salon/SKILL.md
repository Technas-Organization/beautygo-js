---
name: site-de-salon
description: Créer le site vitrine d'un salon de beauté ou d'une pro (coiffure, tresses, ongles, cils, barbier, esthétique) branché sur BeautyGo avec le paquet @beautygo/site. Prestations, créneaux, offres, boutique, carte cadeau et avis restent à jour tout seuls. À charger dès qu'on demande « le site d'un salon », « un site pour ma cliente coiffeuse », ou qu'un projet contient une clé qui commence par bgo_pk_.
---

# Le site d'un salon, branché sur BeautyGo

Tu construis le site d'UN salon (ou d'une pro) à SA marque. Tout ce qui change (prestations, prix,
créneaux, offres, produits, photos, avis, horaires, adresse) est lu chez BeautyGo par le paquet
`@beautygo/site`. Rien de cela ne s'écrit en dur : le jour où le salon change un prix dans son app, le
site suit.

Le résultat attendu ressemble à https://beautygo.fr/demo/studio-azur/ (le même site avec la console
du SDK : https://beautygo.fr/demo/studio-azur/dev/).

## 1. Avant d'écrire une ligne : la marque

Un site de salon se juge en trois secondes. Fixe d'abord, par écrit, ces quatre choses. Si la personne
ne les donne pas, propose-les et dis-le.

- **Le nom et le logo.** Le logo est la photo de sa fiche BeautyGo (`provider.photo_url`). Il va dans
  l'en-tête, en icône d'onglet et dans l'aperçu du lien. Pas de logo : dessine un monogramme simple
  dans sa couleur, jamais des initiales grises. Pas d'étoile ni d'étincelle : elles font « IA ».
- **UNE couleur.** Une seule couleur d'accent, celle du salon. Tout ce qui est teinté en dérive
  (fonds clairs, badges, dégradés). Jamais une deuxième couleur vive « pour égayer » : c'est ce qui
  donne l'impression d'un code couleur non tenu. Le vert reste permis pour un seul état : « Ouvert ».
- **La direction.** Moderne : grands titres en sans-serif gras, beaucoup de blanc, cartes très
  arrondies, données en direct mises en avant. Pas de sérif sur fond beige ni d'arches : daté.
- **Le ton.** Vouvoiement ou tutoiement, un seul pour tout le site. Les offres servies par BeautyGo
  tutoient : choisis en connaissance de cause.

## 2. Brancher

```js
import { createBeautyGo, resolveLocale } from '@beautygo/site';

const bg = createBeautyGo({
  key: 'bgo_pk_…',                                   // la clé du salon, publique
  locale: resolveLocale(navigator.languages),          // une des six langues servies, jamais une autre
});
const [site, hours] = await Promise.all([bg.site(), bg.hours().catch(() => null)]);
```

- Clé de démonstration, pour commencer sans cliente : `bgo_pk_test_uDyKYsZsv6Fu6bhif0XKUgrK`
  (le Studio Azur, un salon fictif). On la remplace par la vraie à la fin, le code ne change pas.
- La clé va dans le code du site, jamais dans une adresse. Aucune autre clé, aucun mot de passe.
- Ce skill suppose la version 0.3.0 du paquet ou une plus récente (`npm install @beautygo/site@^0.3.0`).
- Sans outil de construction : `import … from 'https://cdn.jsdelivr.net/npm/@beautygo/site@0.3/src/index.js'`.
  Toujours avec la version : sans elle, le CDN sert la dernière publiée, qui peut être plus ancienne que ce skill
  (`resolveLocale`, `slots({ days })` et `priceOf` n'existent pas avant la 0.3.0, et la page ne se charge pas).
- Le paquet réessaie seul une API occupée. Ne code pas de boucle de réessai.

## 3. Les sections, dans l'ordre, et ce qui les nourrit

| Section | Ce qu'on lit | Si c'est vide |
|---|---|---|
| En-tête | `provider.photo_url`, `provider.name`, menu, « Réserver » | toujours là |
| Haut de page | `provider.bio`, `openingStatus(hours, { timeZone: provider.timezone })`, `provider.city`, `venues(site)`, photos du `portfolio`, `nextSlot(await bg.slots({ days: 14, serviceId }))` | pas de note sans avis |
| Offres | `site.offers` : `title`, `conditions`, `percent` | la section disparaît |
| Prestations | `site.services` : `name`, `category_label`, `photo_url`, `priceOf`, `durationOf`, `location_options` | toujours là |
| Réserver | `bg.slots({ days: 14, serviceId })`, `slot.discount_percent`, `bookingUrl(site, { serviceId, slot })` | `booking.reason` dit pourquoi |
| Boutique | `site.products`, `bg.cart(site)`, `cart.checkoutUrl()` | la section disparaît |
| Carte cadeau | `site.gift_card` | la section disparaît |
| Galerie | `site.portfolio` | la section disparaît |
| Avis | `site.reviews`, `provider.rating`, `provider.reviews_url` | la section disparaît |
| Équipe (salon) | `provider.team` | la section disparaît |
| Infos | `hours.schedule`, `provider.address`, `provider.location`, `provider.socials`, `provider.contact_url` | chaque bloc à part |

Écris les prix et les durées avec `formatPrice` et `formatDuration` : ils savent qu'un franc CFA n'a
pas de centimes et qu'une fourchette s'écrit « de 110 € à 150 € ».

## 4. Les règles qui font un bon site

**Où elle travaille.** `venues(site)` dit « au salon », « à domicile » ou les deux : dis-le en haut de
page et sur chaque prestation. `provider.address` n'existe que si le salon l'affiche. Sur la carte,
`provider.location.precise` vrai = une épingle ; faux = un cercle d'environ un kilomètre, jamais une
épingle. En français, écris « d'Antibes », « de Nice », « du Havre ».

**Chaque bouton arrive au bon écran.** La visiteuse choisit sur le site ; BeautyGo ne s'ouvre qu'au
dernier pas, déjà rempli.

| Bouton | Adresse |
|---|---|
| Réserver (prestation, puis créneau) | `bg.bookingUrl(site, { serviceId, slot })` |
| Réserver à domicile ou au salon (elle l'a choisi sur le site) | `bg.bookingUrl(site, { serviceId, slot, venue: 'home' })` ou `venue: 'salon'` |
| Réserver avec des produits | `bg.bookingUrl(site, { serviceId, slot, products })` |
| Réserver (en-tête, pied de page) | `bg.bookingUrl(site)` : la réservation au choix de la prestation |
| Payer le panier | `cart.checkoutUrl()` |
| En profiter (offre) | l'agenda du site ouvert sur la prestation et les créneaux de l'offre, puis `bookingUrl` |
| Offrir | `site.gift_card.url` |
| Offrir cette prestation | `bg.giftCardUrl(site, { serviceId })` |
| Voir les avis | `provider.reviews_url` |
| Écrire | `provider.contact_url` (la discussion s'ouvre ; `null` pour un salon pas encore publié) |

N'envoie jamais sur sa fiche en laissant la personne tout rechoisir : aucun bouton ne pointe
`provider.profile_url`, sauf un « Voir sa page BeautyGo » assumé. Si le site laisse choisir le lieu,
passe-le (`venue`) : sinon BeautyGo prend le premier lieu de la prestation.

**Rien d'inventé.** Pas d'avis écrits à la main, pas de note sans avis, pas de prix recalculé : la
remise d'un créneau est `slot.discount_percent`, appliquée par BeautyGo à la réservation. Pas de
téléphone ni d'e-mail du salon s'ils ne viennent pas de lui.

**Le chargement.** Tant qu'une donnée arrive, montre sa silhouette qui miroite, à sa taille finale.
Jamais un texte provisoire (« --:-- », « Chargement… ») qui se réécrit ensuite. Une photo pas encore
chargée ne prend pas la place d'une photo affichée.

**Le téléphone d'abord.** Dessine pour 360 px de large avant l'ordinateur. Aucun défilement
horizontal. Un bouton « Réserver » reste sous le pouce. Rien de flottant ne couvre un texte ou un
bouton. Quand une fenêtre est ouverte (panier, photo, menu), la page derrière ne défile plus :

```css
html:has(dialog:modal) { overflow: hidden; }
dialog, dialog * { overscroll-behavior: contain; }
```

**Quand quelque chose ferme.** `site.booking.available` faux : le site garde tout son contenu, les
boutons « Réserver » s'effacent et un mot dit pourquoi (`paused` : « Réservations en pause » ;
`closed` : « Réservez par téléphone »). Boutique fermée : la section disparaît. Une erreur du paquet
est une `BeautyGoError` : lis `error.code`, garde la page en place et propose de réessayer.

**Rien de technique à l'écran.** Pas de nom de fonction, de compteur, d'identifiant ni de mention du
paquet sur le site d'un salon. Un bandeau de cookies prend la couleur du salon.

**L'aperçu du lien.** Balises `og:title`, `og:description`, `og:image` (1200 × 630 : logo, nom, deux
ou trois photos), icône d'onglet au logo. C'est ce que le salon verra en recevant le lien.

**Les photos.** Celles du `portfolio`, recadrées sur ce qu'elles montrent (cheveux en entier, mains
pour les ongles). Si elles ne vont pas avec la couleur du salon, dis-le plutôt que de les teinter
toi-même. Une image créée par une IA est signalée comme telle.

## 5. Avant de dire « c'est fini »

1. Ouvre le site à 360, 768 et 1440 px de large et regarde chaque section. Fais une capture.
2. Clique chaque bouton : il mène au bon écran, déjà rempli (tableau ci-dessus).
3. Ouvre le panier et fais défiler dedans : la page derrière ne bouge pas.
4. Coupe le réseau une fois : la page reste en place et dit quoi faire.
5. La console du navigateur est vide. Aucun texte en dur ne répète une donnée de BeautyGo.
6. Change la langue : tout le site change, les données aussi.

## 6. Ce qu'on dit pour l'obtenir

```text
Fais le site de mon salon avec le paquet @beautygo/site et le skill site-de-salon.
Clé : bgo_pk_…   (ou la clé de démonstration pour commencer)
Couleur du salon : #2B4BFF.   Ton : vouvoiement.
Sections : offres, prestations, réservation, boutique, carte cadeau, galerie, infos.
Montre-moi une capture sur téléphone et sur ordinateur avant de dire que c'est fini.
```
