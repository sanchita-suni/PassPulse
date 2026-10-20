/**
 * Event repository (FR-004 to FR-007).
 *
 * Mirrors the events and ticket_tiers tables in db/schema.sql. Like the user,
 * ticket and check-in stores on main, records are held in process memory until
 * the PostgreSQL repositories are switched on (see docs/DEVIATIONS.md, DEV-004).
 */
const eventsStore = new Map();

function clone(event) {
  return {
    ...event,
    tiers: event.tiers.map((t) => ({ ...t })),
    notices: (event.notices || []).map((n) => ({ ...n })),
  };
}

function withAvailability(event) {
  const copy = clone(event);
  copy.tiers = copy.tiers.map((t) => ({ ...t, available: t.quota - t.sold }));
  return copy;
}

function getDefaultSeedEvents() {
  const now = new Date().toISOString();
  const base = {
    organizerId: 'USR-ORG-001',
    isFlagged: false,
    notices: [],
    createdAt: now,
    updatedAt: now,
  };
  return [
    {
      ...base,
      id: 'EVT-TECH-2026',
      title: 'TechSummit 2026',
      description: 'A full-day conference on AI systems, cloud infrastructure and developer tooling.',
      category: 'Tech',
      venue: 'Main Auditorium, PES Tech Campus',
      eventDate: '2026-11-15T09:30:00.000Z',
      capacity: 600,
      status: 'PUBLISHED',
      tiers: [
        { id: 'TIER-TECH-EB', name: 'Early Bird', price: 299, quota: 150, sold: 150, maxPerOrder: 5 },
        { id: 'TIER-TECH-GEN', name: 'General', price: 499, quota: 350, sold: 120, maxPerOrder: 5 },
        { id: 'TIER-TECH-VIP', name: 'VIP Pass', price: 799, quota: 100, sold: 41, maxPerOrder: 2 },
      ],
    },
    {
      ...base,
      id: 'EVT-CULT-2026',
      title: 'PassPulse Cultural Fest 2026',
      description: 'Music, dance and food stalls across two stages.',
      category: 'Cultural',
      venue: 'Open Air Amphitheatre',
      eventDate: '2026-12-05T17:00:00.000Z',
      capacity: 1200,
      status: 'PUBLISHED',
      tiers: [
        { id: 'TIER-CULT-EB', name: 'Early Bird', price: 199, quota: 300, sold: 210, maxPerOrder: 5 },
        { id: 'TIER-CULT-GA', name: 'General Admission', price: 399, quota: 900, sold: 310, maxPerOrder: 5 },
      ],
    },
    {
      ...base,
      id: 'EVT-MUSIC-2026',
      title: 'Indie Night Live',
      description: 'Four local indie bands, one evening.',
      category: 'Music',
      venue: 'Koramangala Social Hall',
      eventDate: '2026-11-28T19:00:00.000Z',
      capacity: 300,
      status: 'LIVE',
      tiers: [{ id: 'TIER-MUSIC-GA', name: 'General', price: 599, quota: 300, sold: 188, maxPerOrder: 5 }],
    },
    {
      ...base,
      id: 'EVT-SPORT-2026',
      title: 'Campus 10K Run',
      description: 'Timed 10 km run with medals for every finisher.',
      category: 'Sports',
      venue: 'PES Sports Ground',
      eventDate: '2027-01-17T06:00:00.000Z',
      capacity: 800,
      status: 'PUBLISHED',
      tiers: [{ id: 'TIER-SPORT-RUN', name: 'Runner', price: 0, quota: 800, sold: 96, maxPerOrder: 1 }],
    },
    {
      ...base,
      id: 'EVT-WORK-2026',
      title: 'Robotics Hands-on Workshop',
      description: 'Build and program a line-following robot in teams of three.',
      category: 'Workshop',
      venue: 'Seminar Hall 3',
      eventDate: '2026-12-12T10:00:00.000Z',
      capacity: 60,
      status: 'DRAFT',
      tiers: [],
    },
    {
      ...base,
      id: 'EVT-COMEDY-2026',
      title: 'Open Mic Comedy',
      description: 'Ten comics, ten minutes each.',
      category: 'Comedy',
      venue: 'Black Box Theatre',
      eventDate: '2026-11-21T20:00:00.000Z',
      capacity: 150,
      status: 'PENDING_APPROVAL',
      tiers: [{ id: 'TIER-COMEDY-GA', name: 'General', price: 249, quota: 150, sold: 0, maxPerOrder: 5 }],
    },
  ];
}

class EventModel {
  static async findAll() {
    return [...eventsStore.values()].map(withAvailability);
  }

  static async findById(id) {
    const event = eventsStore.get(id);
    return event ? withAvailability(event) : null;
  }

  static async insert(event) {
    eventsStore.set(event.id, clone(event));
    return withAvailability(event);
  }

  static async save(event) {
    const { tiers, ...rest } = event;
    const stored = {
      ...rest,
      tiers: tiers.map(({ available, ...t }) => t),
      updatedAt: new Date().toISOString(),
    };
    eventsStore.set(event.id, clone(stored));
    return withAvailability(stored);
  }

  static seedDefaultEvents() {
    if (eventsStore.size === 0) {
      for (const event of getDefaultSeedEvents()) {
        eventsStore.set(event.id, event);
      }
    }
  }

  static async clearAll() {
    eventsStore.clear();
  }
}

// Demo catalog is loaded only in development, matching the user seed policy.
if (process.env.NODE_ENV === 'development') {
  EventModel.seedDefaultEvents();
}

module.exports = EventModel;
module.exports.getDefaultSeedEvents = getDefaultSeedEvents;
