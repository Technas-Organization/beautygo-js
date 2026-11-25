/** The languages BeautyGo answers in. */
export type Locale = 'fr' | 'en' | 'pt' | 'es' | 'de' | 'it';
/** The same list at run time, e.g. to build a language menu. */
export const LOCALES: readonly Locale[];
/**
 * The language to ask for, from whatever a browser or a visitor gives you:
 * `resolveLocale(navigator.languages)`, `resolveLocale('pt-BR')` gives `'pt'`.
 * Returns `fallback` (French by default) when none of them is served.
 */
export function resolveLocale(input: string | readonly string[] | null | undefined, fallback?: Locale): Locale;

export interface BeautyGoOptions {
  /** Your site key. It starts with `bgo_pk_`. Public: safe in browser code. */
  key: string;
  baseUrl?: string;
  /**
   * The language of translated fields (names, labels, offers). One of `LOCALES`;
   * a browser tag such as `pt-BR` is accepted and read as `pt`, anything else as French.
   */
  locale?: Locale;
  /**
   * How many times a busy API (429) or a network hiccup is asked again before the error
   * reaches you. Default 2; 0 turns it off.
   */
  retries?: number;
  fetch?: typeof fetch;
  /**
   * How the sentences BeautyGo writes for you (the offers) address your clients:
   * `formal` ("à votre 3ᵉ visite", "Ihrem", "su"), the default, or `informal` ("à ta 3ᵉ visite").
   * Pick the one your own texts use.
   */
  register?: Register;
}

export type Register = 'formal' | 'informal';

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
/** Where a service takes place: at the client's (`home`), at the salon, or at the professional's own place. */
export type ServiceLocation = 'home' | 'salon' | 'stylist_home';
export type SocialPlatform =
  | 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'snapchat' | 'whatsapp' | 'pinterest' | 'linkedin' | 'x' | 'website';

export interface TeamMember {
  name: string | null;
  username: string | null;
  photo_url: string | null;
  rating: { average: number | null; count: number | null };
}

export interface Provider {
  /** `pro` (one professional) or `salon` (a team). */
  type: 'pro' | 'salon';
  name: string | null;
  display_name: string | null;
  business_name: string | null;
  username: string | null;
  bio: string | null;
  photo_url: string | null;
  cover_url: string | null;
  city: string | null;
  country_code: string | null;
  languages: string[];
  categories: string[];
  /** Her social pages, as addresses. `socials` says which network each one is. */
  social_links: string[];
  /** Her social pages with their network, ready for an icon. */
  socials: { platform: SocialPlatform | (string & {}); url: string }[];
  /** The venue's time zone (IANA, e.g. `Europe/Paris`): "today" and "open now" are read there. */
  timezone: string | null;
  rating: { average: number | null; count: number | null };
  /** Only when the professional (or the salon) chose to show the address. */
  address: string | null;
  /**
   * Where to put her on a map: exactly what BeautyGo's own map shows a visitor.
   * `precise` is true only for a salon whose address is shown; otherwise the point is the
   * centre of her area (about 1 km): draw an area, not a pin. Phone and e-mail are never public.
   */
  location: {
    precise: boolean;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    country_code: string | null;
  };
  /** Her page in BeautyGo: reviews, all her services, "Contact". */
  profile_url: string;
  /** Her page opened on her reviews. `null` when she has none yet. */
  reviews_url: string | null;
  /**
   * Your "Write to her" button: her page in BeautyGo with the conversation open (the visitor signs
   * in first if she has no account). A salon: its own conversation, `null` until it is published.
   */
  contact_url: string | null;
  /** Salons only: who takes appointments there. */
  team?: TeamMember[];
}

export interface Service {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  /** The category and sub-category, written in the language you asked for. */
  category_label: string | null;
  sub_category_label: string | null;
  /** The first portfolio photo that shows this service, `null` when there is none. */
  photo_url: string | null;
  /** `fixed`: read `price`. `range`: write "from price_min to price_max" (see `priceOf`). */
  pricing_type: 'fixed' | 'range' | null;
  /** The price when it is fixed, `null` for a range. */
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  /** ISO code, e.g. `EUR`, `XOF`. */
  currency: string | null;
  duration_minutes: number | null;
  duration_min_minutes: number | null;
  duration_max_minutes: number | null;
  deposit_required: boolean | null;
  /** Where it takes place: `home` (at the client's), `salon`, `stylist_home`. See `venues(site)`. */
  location_options: ServiceLocation[] | null;
  /** Opens the booking flow on this service. `null` when booking is closed. */
  booking_url: string | null;
}

/** A product of her shop, as BeautyGo sells it. */
export interface Product {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  /** Net content as written on the product, e.g. `150 ml`. */
  size: string | null;
  category: string | null;
  /** The category, written in the language you asked for. `null` when BeautyGo has no label for it. */
  category_label: string | null;
  /** The selling price, in `currency`. */
  price: number | null;
  /** ISO code, e.g. `EUR`, `XOF`. */
  currency: string | null;
  photo_url: string | null;
  photos: string[];
  /** For sale and in stock right now. */
  available: boolean;
  /** The most one order can take (stock when it is tracked, 99 otherwise). 0 when not available. */
  max_quantity: number;
  /** The services it is used for (ids from `services`). */
  service_ids: string[];
  /** Opens this product in BeautyGo (the app if installed, the web otherwise). */
  product_url: string;
}

export interface Review {
  rating: number | null;
  comment: string | null;
  client_name: string | null;
  service_name: string | null;
  response: string | null;
  created_at: string | null;
}

/** An offer of hers (or of the salon), as her clients read it in BeautyGo. */
export interface Offer {
  id: string;
  /**
   * `loyalty` (a visit tier), `referral` (a friend she refers), `off_peak` (quiet hours),
   * `last_minute`, `group` (come with friends), `first_visit`, `winback`, `regulars`,
   * `happy_hour` (a fixed price at set hours). New kinds may be added: show `title` for any.
   */
  type: OfferType | (string & {});
  /** The promise, in the visitor's language, e.g. "−10 % à ta 3ᵉ visite". */
  title: string;
  /** The same promise with her name, for a sentence. */
  sentence: string;
  /** Up to three lines: when it applies ("Mardi, de 9 h à 12 h", the next tier…). */
  conditions: string[];
  /** The highest discount a client can get, for a badge. `null` when it is not a percentage. */
  percent: number | null;
  /** ISO date when the offer ends, `null` when it has no end. */
  valid_until: string | null;
  /** The services it is limited to (ids from `services`); empty = all of them. */
  service_ids: string[];
  /**
   * Where BeautyGo takes over, already on the right screen: the booking flow of the first service the
   * offer is limited to, or the "refer a friend" screen for a referral. For an offer on every service
   * it is her general booking page: prefer letting the visitor choose a service on your own site
   * (`offersOf`, `slots`), then `bookingUrl({ serviceId, slot })`. `null` when booking is closed.
   */
  booking_url: string | null;
}

export type OfferType =
  | 'loyalty' | 'referral' | 'off_peak' | 'last_minute' | 'group' | 'first_visit' | 'winback' | 'regulars' | 'happy_hour';

export interface Site {
  api_version: 'v1';
  provider: Provider;
  services: Service[];
  /** `service_ids`: the services a photo shows (ids from `services`). */
  portfolio: { url: string; description?: string | null; service_ids?: string[] }[];
  reviews: Review[];
  /** Her products for sale. Salons: the products of the team. Empty when the shop is off or paused. */
  products: Product[];
  shop: {
    available: boolean;
    /** Where `checkoutUrl()` sends the visitor (it adds the cart). `null` when nothing is for sale. */
    cart_url: string | null;
  };
  booking: {
    available: boolean;
    /** Why booking is closed: `paused` (taking a break) or `closed` (the plan no longer covers it). `null` when open. */
    reason: 'paused' | 'closed' | null;
    /** The booking flow, opened on the choice of the service (`bookingUrl()` without a service). */
    url: string | null;
  };
  /** Her current offers (loyalty, quiet hours, referral…). Empty while she is paused. Managed in BeautyGo only. */
  offers: Offer[];
  /** Her "Offer a service" page: a gift card paid in BeautyGo, booked later by the person who receives it. */
  gift_card: {
    available: boolean;
    /** Why it is not on sale: `not_payable` (she does not take online payments), `inactive`, `no_priceable_service`, `not_offered`. */
    reason: 'not_payable' | 'inactive' | 'no_priceable_service' | 'not_offered' | string | null;
    url: string | null;
  };
}

export interface Slot {
  date?: string;
  start_time: string;
  /** At a salon, when the first free team member would finish. */
  end_time: string | null;
  /** With the venue's UTC offset, e.g. `2026-12-01T09:00:00+01:00`. */
  start_at?: string;
  end_at?: string;
  /** The quiet-hours or last-minute discount BeautyGo applies on this slot (e.g. `15`), `null` when none. */
  discount_percent?: number | null;
}

export interface DayHours {
  /** False: closed that day, whatever `ranges` says. */
  enabled: boolean;
  /** Opening ranges, `HH:MM`, e.g. morning and afternoon. */
  ranges: { start: string; end: string }[];
}

export interface Hours {
  api_version: 'v1';
  schedule: Partial<Record<Weekday, DayHours>>;
  slot_duration_minutes: number | null;
}

/** At a salon, `serviceId` is required: slots depend on who does the service. */
export type SlotsQuery =
  /** The next days from today at the venue, 1 to 31: the usual case. */
  | { days: number; serviceId?: string }
  | { date: string | Date; serviceId?: string }
  | { from: string | Date; to: string | Date; serviceId?: string };

export interface DaySlots { api_version: 'v1'; date: string; slots: Slot[] }
export interface RangeSlots { api_version: 'v1'; days: { date: string; slots: Slot[] }[] }

/** A cart line, as `checkoutUrl()` and `bookingUrl({ products })` accept it. */
export type CartItems =
  | Cart
  | { id?: string; productId?: string; quantity?: number }[]
  | Record<string, number>;

export interface Cart {
  /** Each line with its product and quantity. */
  readonly items: { product: Product; quantity: number }[];
  /** Number of units. */
  readonly count: number;
  /** Totals per currency, rounded to the cent. */
  readonly totals: { currency: string; amount: number }[];
  lines(): { id: string; quantity: number }[];
  quantityOf(productId: string): number;
  /** Returns the quantity now in the cart (bounded by `max_quantity`), 0 when it cannot be bought. */
  add(productId: string, quantity?: number): number;
  /** Sets the quantity (0 removes it). Returns the quantity kept. */
  set(productId: string, quantity: number): number;
  remove(productId: string): void;
  clear(): void;
  /** Re-bounds the cart on fresh data from `site()`. */
  refresh(site: Site): Cart;
  /** Called after every change. Returns a function that stops listening. */
  subscribe(listener: (cart: Cart) => void): () => void;
  /** The "Pay" address for this cart. */
  checkoutUrl(options?: CheckoutOptions): string | null;
}

/** Where the appointment takes place: at her salon (or her own place), or at the client's home. */
export type Venue = 'salon' | 'home';

export interface BookingOptions {
  /** Opens the booking flow on this service. Without it, on the choice of the service. */
  serviceId?: string;
  /** A slot from `slots()`: its day and time are preselected. */
  slot?: Slot;
  /** Preselects where, when the service takes place there (see `venues()`). Ignored for a salon. */
  venue?: Venue;
  /** Products on the same appointment (a professional only). */
  products?: CartItems;
}

export interface CheckoutOptions {
  /** A professional only: book this service with the products, on the same appointment. */
  serviceId?: string;
  slot?: Slot;
  venue?: Venue;
}

export interface CartOptions {
  /** Where the cart survives a reload. Default: `localStorage` in a browser, nothing on a server. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  storageKey?: string;
}

export interface BeautyGo {
  /** The language asked for, `null` when none was given. */
  readonly locale: Locale | null;
  /** How the offers address your clients. */
  readonly register: Register;
  site(init?: RequestInit): Promise<Site>;
  /** The products for sale (the same list as `site().products`). */
  products(init?: RequestInit): Promise<Product[]>;
  /** A professional's weekly hours. A salon answers `no_salon_hours`. */
  hours(init?: RequestInit): Promise<Hours>;
  slots(query: SlotsQuery, init?: RequestInit): Promise<DaySlots | RangeSlots>;
  /**
   * The address of your "Book" button. Without `serviceId`, BeautyGo opens the booking flow on the
   * choice of the service. `products`: add products to the appointment (a professional only).
   */
  bookingUrl(site: Site, options?: BookingOptions): string | null;
  /**
   * The address of "Offer this service": her gift card page, this service already chosen.
   * `null` when gift cards are not on sale (`site.gift_card.available`).
   */
  giftCardUrl(site: Site, options?: { serviceId?: string }): string | null;
  /**
   * The "Pay" address: BeautyGo opens the order with these products in it, prices and stock
   * read again there. The visitor's own BeautyGo cart is left as it is. `null` when nothing can be bought.
   */
  checkoutUrl(site: Site, items: CartItems, options?: CheckoutOptions): string | null;
  /** A cart kept on your website, bounded by stock. Nothing is sent until `checkoutUrl()`. */
  cart(site: Site, options?: CartOptions): Cart;
}

export type BeautyGoErrorCode =
  | 'missing_key'
  | 'unknown_key'
  | 'origin_not_allowed'
  | 'site_not_found'
  | 'bad_request'
  | 'service_required'
  | 'no_salon_hours'
  | 'unavailable'
  | 'rate_limited'
  | 'network_error'
  | 'unexpected_response';

export class BeautyGoError extends Error {
  status: number;
  code: BeautyGoErrorCode | string;
}

export function createBeautyGo(options: BeautyGoOptions): BeautyGo;

// ── Helpers every website ends up writing (pure functions) ──────────────────

/** Today at the venue, `YYYY-MM-DD`. Pass the site (its `provider.timezone`) or a time zone name. */
export function venueDay(siteOrTimeZone: Site | string | null | undefined, now?: Date): string;

export interface OpeningStatus {
  open: boolean;
  /** When open: the end of the current range, `HH:MM`. */
  closesAt: string | null;
  /** When closed: the next opening, `HH:MM`. `null` when she is closed all week. */
  opensAt: string | null;
  /** 0 = later today, 1 = tomorrow… */
  opensInDays: number | null;
  opensOn: Weekday | null;
}
/** Is she open right now? Pass `{ timeZone: site.provider.timezone }`. `null` when there is no schedule. */
export function openingStatus(hours: Hours | null | undefined, options?: { timeZone?: string | null; now?: Date }): OpeningStatus | null;

/** The first free slot of a `slots()` answer (one day or a range). */
export function nextSlot(answer: DaySlots | RangeSlots | null | undefined): { date: string | null; slot: Slot } | null;

/** The portfolio photos that show this service. */
export function photosOf(site: Site, serviceId: string): Site['portfolio'];
/** The shop products that go with this service. */
export function productsOf(site: Site, serviceId: string): Product[];
/** The offers that apply to this service: those on every service, and those limited to it. */
export function offersOf(site: Site, serviceId: string): Offer[];
/** Where she works, all services together: at a venue, at the client's, or both. */
export function venues(site: Site | null | undefined): { salon: boolean; home: boolean };

/** What a service costs. `fixed` false: write "from min to max". `null` when no price is set. */
export function priceOf(service: Service): { fixed: boolean; min: number; max: number; currency: string | null } | null;
/** How long a service takes, in minutes. */
export function durationOf(service: Service): { fixed: boolean; min: number; max: number } | null;
/** `45 €`, `12,90 €`, `5 000 F CFA`: the currency's own decimals, none when the amount is whole. */
export function formatPrice(amount: number | null | undefined, currency?: string | null, locale?: Locale | string): string;
/** `45 min`, `1 h`, `1 h 30`. */
export function formatDuration(minutes: number | null | undefined): string;
