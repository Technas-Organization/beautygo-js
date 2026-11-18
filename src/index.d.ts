export interface BeautyGoOptions {
  /** Your site key. It starts with `bgo_pk_`. Public: safe in browser code. */
  key: string;
  baseUrl?: string;
  /** Preferred language of translated fields, e.g. `fr`, `en`. */
  locale?: string;
  fetch?: typeof fetch;
}

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
  social_links: string[];
  rating: { average: number | null; count: number | null };
  /** Only when the professional (or the salon) chose to show the address. */
  address: string | null;
  /** Salons only: who takes appointments there. */
  team?: TeamMember[];
}

export interface Service {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  /** `fixed`: read `price`. `range`: write "from price_min to price_max". */
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
  /** Where it takes place: `home` (at the client's), `salon`, `stylist_home`. */
  location_options: string[] | null;
  /** Opens the booking flow on this service. `null` when booking is closed. */
  booking_url: string | null;
}

export interface Review {
  rating: number | null;
  comment: string | null;
  client_name: string | null;
  service_name: string | null;
  response: string | null;
  created_at: string | null;
}

export interface Site {
  api_version: 'v1';
  provider: Provider;
  services: Service[];
  portfolio: { url: string }[];
  reviews: Review[];
  booking: {
    available: boolean;
    /** Why booking is closed: `paused` (taking a break) or `closed` (the plan no longer covers it). `null` when open. */
    reason: 'paused' | 'closed' | null;
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
}

export interface Hours {
  api_version: 'v1';
  schedule: Record<string, unknown>;
  slot_duration_minutes: number | null;
}

/** At a salon, `serviceId` is required: slots depend on who does the service. */
export type SlotsQuery =
  | { date: string | Date; serviceId?: string }
  | { from: string | Date; to: string | Date; serviceId?: string };

export interface DaySlots { api_version: 'v1'; date: string; slots: Slot[] }
export interface RangeSlots { api_version: 'v1'; days: { date: string; slots: Slot[] }[] }

export interface BeautyGo {
  site(init?: RequestInit): Promise<Site>;
  /** A professional's weekly hours. A salon answers `no_salon_hours`. */
  hours(init?: RequestInit): Promise<Hours>;
  slots(query: SlotsQuery, init?: RequestInit): Promise<DaySlots | RangeSlots>;
  bookingUrl(site: Site, options?: { serviceId?: string; slot?: Slot }): string | null;
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
