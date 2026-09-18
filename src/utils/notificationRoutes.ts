export interface NotificationLike {
  related_entity: string | null;
  related_id: string | null;
  notification_type?: string | null;
}

// related_entity -> base route. Every destination highlights via
// ?highlight=<id>; hlKind disambiguates pages that host more than one
// entity type (e.g. /site-visits has both quick_site_visit and site_visit).
const ENTITY_ROUTES: Record<string, string> = {
  lead: '/leads',
  bulk_upload: '/bulk-uploads',
  booking: '/bookings',
  payment: '/payments',
  staff_target: '/targets',
  followup: '/follow-ups',
  site_visit: '/site-visits',
  quick_site_visit: '/site-visits',
  channel_partner: '/channel-partners',
  channel_partner_requests: '/channel-partners',
  cp_outreach: '/cp-outreach',
  whatsapp_outbox: '/whatsapp-messages',
  leave_request: '/attendance',
};

// Builds the click destination for a notification. `hl` is a timestamp so
// clicking the same notification twice in a row still re-triggers the
// highlight effect (a bare id in the query string wouldn't change).
export function notificationTarget(n: NotificationLike, role?: string | null): string | null {
  if (!n.related_entity) return null;
  const base = ENTITY_ROUTES[n.related_entity];
  if (!base) return null;
  // WhatsApp Messages is super_admin-only -- the notification stays
  // informational (no destination) for everyone else.
  if (base === '/whatsapp-messages' && role !== 'super_admin') return null;
  if (!n.related_id) return base;
  return `${base}?highlight=${n.related_id}&hlKind=${n.related_entity}&hl=${Date.now()}`;
}
