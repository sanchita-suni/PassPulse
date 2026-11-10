const db = require('../config/db');
const EventModel = require('../models/event.model');
const { getConfirmedTicketsByEvent } = require('./ticket.service');
const { generateCsv } = require('../utils/csv.util');
const { generatePdfReport } = require('../utils/pdf.util');

function getCheckinService() {
  return require('./checkin.service');
}

/**
 * In-memory bookings repository for test and development fallback.
 * Map<string, {
 *   id: string,
 *   bookingId: string,
 *   userId: string,
 *   eventId: string,
 *   purchaserName: string,
 *   purchaserEmail: string,
 *   status: 'CONFIRMED' | 'CANCELLED' | 'EXPIRED',
 *   totalAmount: number,
 *   createdAt: string,
 *   ticketCount: number,
 *   tierNames: string
 * }>
 */
const inMemoryBookings = new Map();

function registerBookingRecord(booking) {
  if (!booking || !booking.id) {
    throw new Error('id is required to register a booking record');
  }
  const id = booking.id;
  inMemoryBookings.set(id, {
    id,
    bookingId: id,
    userId: booking.userId || 'USR-UNKNOWN',
    eventId: booking.eventId,
    purchaserName: booking.purchaserName || booking.attendeeName || 'Anonymous',
    purchaserEmail: booking.purchaserEmail || booking.attendeeEmail || '',
    status: booking.status || 'CONFIRMED',
    totalAmount: Number(booking.totalAmount !== undefined ? booking.totalAmount : booking.price || 0),
    createdAt: booking.createdAt || new Date().toISOString(),
    ticketCount: Number(booking.ticketCount || 1),
    tierNames: booking.tierNames || booking.ticketTier || 'General',
  });
  return inMemoryBookings.get(id);
}

function clearBookingRecords() {
  inMemoryBookings.clear();
}

function getBookingRecordsByEvent(eventId) {
  if (!eventId) return [];
  const results = [];
  for (const b of inMemoryBookings.values()) {
    if (b.eventId === eventId) {
      results.push(b);
    }
  }
  return results;
}

/**
 * Retrieves event metadata from PostgreSQL or in-memory EventModel.
 *
 * @param {string} eventId
 * @returns {Promise<{
 *   id: string,
 *   title: string,
 *   category: string,
 *   venue: string,
 *   eventDate: string,
 *   capacity: number,
 *   status: string,
 *   organizerId: string,
 *   tiers: Array<any>
 * } | null>}
 */
async function getEventMetadata(eventId) {
  if (db.isPoolInitialized()) {
    const pool = db.getPool();
    const eventResult = await pool.query(
      `SELECT id, organizer_id, title, description, category, venue, event_date, capacity, status
       FROM events
       WHERE id = $1`,
      [eventId]
    );
    if (!eventResult.rowCount) return null;
    const row = eventResult.rows[0];

    const tiersResult = await pool.query(
      `SELECT id, name, price::numeric(10,2) AS price, quota, sold, max_per_order
       FROM ticket_tiers
       WHERE event_id = $1
       ORDER BY price DESC, name ASC`,
      [eventId]
    );

    return {
      id: row.id,
      organizerId: row.organizer_id,
      title: row.title,
      category: row.category,
      venue: row.venue,
      eventDate: row.event_date ? new Date(row.event_date).toISOString() : '',
      capacity: row.capacity,
      status: row.status,
      tiers: tiersResult.rows.map((t) => ({
        id: t.id,
        name: t.name,
        price: Number(t.price),
        quota: t.quota,
        sold: t.sold,
      })),
    };
  }

  const inMemEvent = await EventModel.findById(eventId);
  if (!inMemEvent) return null;
  return {
    id: inMemEvent.id,
    organizerId: inMemEvent.organizerId,
    title: inMemEvent.title,
    category: inMemEvent.category,
    venue: inMemEvent.venue,
    eventDate: inMemEvent.eventDate,
    capacity: inMemEvent.capacity,
    status: inMemEvent.status,
    tiers: Array.isArray(inMemEvent.tiers) ? inMemEvent.tiers : [],
  };
}

/**
 * Generates an attendance report for an event (FR-018).
 *
 * Each ticket row corresponds to an eligible confirmed ticket, including
 * check-in status and timestamp.
 *
 * @param {string} eventId
 * @param {'csv' | 'pdf' | 'json'} [format='csv']
 * @returns {Promise<{
 *   eventId: string,
 *   format: string,
 *   contentType: string,
 *   filename: string,
 *   data: string | Buffer | object,
 *   summary: {
 *     totalConfirmed: number,
 *     totalCheckedIn: number,
 *     attendancePercentage: number
 *   }
 * }>}
 */
async function generateAttendanceReport(eventId, format = 'csv') {
  if (!eventId) throw new Error('eventId is required for attendance report');

  const event = await getEventMetadata(eventId);
  if (!event) {
    const error = new Error(`Event '${eventId}' not found`);
    error.code = 'EVENT_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  let tickets = [];
  let checkedInCount = 0;

  if (db.isPoolInitialized()) {
    const pool = db.getPool();

    // Query confirmed active tickets and their check-in records
    const ticketsResult = await pool.query(
      `SELECT
         t.id AS ticket_id,
         t.booking_id,
         t.status AS ticket_status,
         t.issued_at,
         u.full_name AS attendee_name,
         u.email AS attendee_email,
         tt.name AS tier_name,
         tt.price::numeric(10,2) AS tier_price,
         c.checked_in_at,
         c.scanned_by
       FROM tickets t
       JOIN bookings b ON b.id = t.booking_id
       JOIN users u ON u.id = b.user_id
       JOIN ticket_tiers tt ON tt.id = t.tier_id
       LEFT JOIN check_in_logs c ON c.ticket_id = t.id
       WHERE b.event_id = $1
         AND b.status = 'CONFIRMED'
         AND t.status != 'CANCELLED'
       ORDER BY t.issued_at ASC, t.id ASC`,
      [eventId]
    );

    tickets = ticketsResult.rows.map((row) => ({
      ticketId: row.ticket_id,
      bookingId: row.booking_id,
      attendeeName: row.attendee_name,
      attendeeEmail: row.attendee_email,
      tierName: row.tier_name,
      price: Number(row.tier_price),
      ticketStatus: row.ticket_status,
      checkedIn: Boolean(row.checked_in_at),
      checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
      scannedBy: row.scanned_by || null,
    }));

    // Checked-in count derives from confirmed eligible tickets with successful check-ins
    checkedInCount = tickets.filter((t) => t.checkedIn).length;
  } else {
    // In-memory fallback mode
    const confirmedTickets = getConfirmedTicketsByEvent(eventId);
    const checkInRecords = getCheckinService().getCheckInRecords(eventId);
    const checkinMap = new Map();
    for (const record of checkInRecords) {
      checkinMap.set(record.ticketId, record);
    }

    tickets = confirmedTickets.map((t) => {
      const checkin = checkinMap.get(t.ticketId);
      const isCheckedIn = Boolean(checkin || t.isCheckedIn);
      return {
        ticketId: t.ticketId,
        bookingId: t.bookingReference || t.bookingId || 'BKG-DIRECT',
        attendeeName: t.attendeeName || 'Anonymous',
        attendeeEmail: t.attendeeEmail || '',
        tierName: t.ticketTier || 'General',
        price: Number(t.price || 0),
        ticketStatus: t.ticketStatus || 'VALID',
        checkedIn: isCheckedIn,
        checkedInAt: checkin ? checkin.checkedInAt : t.checkedInAt || null,
        scannedBy: checkin ? checkin.gateStaffId : null,
      };
    });

    checkedInCount = tickets.filter((t) => t.checkedIn).length;
  }

  const totalConfirmed = tickets.length;
  const attendancePercentage = totalConfirmed > 0
    ? Number(Math.min(100, (checkedInCount / totalConfirmed) * 100).toFixed(1))
    : 0;

  const summary = {
    totalConfirmed,
    totalCheckedIn: checkedInCount,
    attendancePercentage,
  };

  const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (format === 'json') {
    return {
      eventId,
      format: 'json',
      contentType: 'application/json',
      filename: `attendance-report-${safeEventId}.json`,
      event,
      summary,
      tickets,
    };
  }

  if (format === 'pdf') {
    const tableRows = tickets.map((t) => [
      t.ticketId,
      t.attendeeName,
      t.tierName,
      t.checkedIn ? 'CHECKED IN' : 'NOT CHECKED IN',
      t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString() : '—',
    ]);

    const pdfBuffer = generatePdfReport({
      title: 'PassPulse Attendance Summary Report',
      subtitle: `Official Gate Telemetry & Turnout Report for ${event.title}`,
      metadata: {
        Event: event.title,
        Category: event.category,
        Date: event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'N/A',
        Venue: event.venue,
        Status: event.status,
        Generated: new Date().toUTCString(),
      },
      kpis: [
        { label: 'Confirmed Attendees', value: String(totalConfirmed) },
        { label: 'Total Checked In', value: String(checkedInCount) },
        { label: 'Turnout Percentage', value: `${attendancePercentage.toFixed(1)}%` },
      ],
      headers: ['Ticket ID', 'Attendee Name', 'Tier', 'Status', 'Check-in Time'],
      rows: tableRows,
      columnRatios: [24, 26, 18, 16, 16],
    });

    return {
      eventId,
      format: 'pdf',
      contentType: 'application/pdf',
      filename: `attendance-report-${safeEventId}.pdf`,
      data: pdfBuffer,
      summary,
    };
  }

  // Default: CSV format
  const headers = [
    'Ticket ID',
    'Attendee Name',
    'Attendee Email',
    'Tier',
    'Booking ID',
    'Ticket Status',
    'Checked In',
    'Check-in Timestamp',
    'Scanned By',
  ];

  const rows = tickets.map((t) => [
    t.ticketId,
    t.attendeeName,
    t.attendeeEmail,
    t.tierName,
    t.bookingId,
    t.ticketStatus,
    t.checkedIn ? 'CHECKED_IN' : 'PENDING',
    t.checkedInAt || '',
    t.scannedBy || '',
  ]);

  const csvString = generateCsv({ headers, rows });

  return {
    eventId,
    format: 'csv',
    contentType: 'text/csv; charset=utf-8',
    filename: `attendance-report-${safeEventId}.csv`,
    data: csvString,
    summary,
  };
}

/**
 * Generates a revenue report for an event (FR-018).
 *
 * Revenue totals are derived strictly from confirmed booking records
 * (SUM(bookings.total_amount)), rather than multiplying sold tickets
 * by current tier prices.
 *
 * @param {string} eventId
 * @param {'csv' | 'pdf' | 'json'} [format='csv']
 * @returns {Promise<{
 *   eventId: string,
 *   format: string,
 *   contentType: string,
 *   filename: string,
 *   data: string | Buffer | object,
 *   summary: {
 *     totalConfirmedRevenue: number,
 *     totalConfirmedBookings: number,
 *     totalTicketsSold: number,
 *     averageOrderValue: number
 *   }
 * }>}
 */
async function generateRevenueReport(eventId, format = 'csv') {
  if (!eventId) throw new Error('eventId is required for revenue report');

  const event = await getEventMetadata(eventId);
  if (!event) {
    const error = new Error(`Event '${eventId}' not found`);
    error.code = 'EVENT_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  let totalRevenue = 0;
  let totalBookings = 0;
  let totalTicketsSold = 0;
  let tierBreakdown = [];
  let bookingsList = [];

  if (db.isPoolInitialized()) {
    const pool = db.getPool();

    // 1. Authoritative Total Revenue from confirmed bookings
    const revResult = await pool.query(
      `SELECT
         COALESCE(SUM(total_amount), 0)::numeric(10,2) AS total_revenue,
         COUNT(*)::int AS total_bookings
       FROM bookings
       WHERE event_id = $1 AND status = 'CONFIRMED'`,
      [eventId]
    );
    totalRevenue = Number(revResult.rows[0]?.total_revenue || 0);
    totalBookings = revResult.rows[0]?.total_bookings || 0;

    // 2. Tier breakdown based on confirmed tickets and tiers
    const tierResult = await pool.query(
      `SELECT
         tt.id AS tier_id,
         tt.name AS tier_name,
         tt.price::numeric(10,2) AS tier_price,
         tt.quota,
         COUNT(ct.id)::int AS tickets_sold,
         COALESCE(SUM(tt.price), 0)::numeric(10,2) AS tier_revenue
       FROM ticket_tiers tt
       LEFT JOIN (
         SELECT t.id, t.tier_id
         FROM tickets t
         JOIN bookings b ON b.id = t.booking_id
         WHERE b.event_id = $1
           AND b.status = 'CONFIRMED'
           AND t.status != 'CANCELLED'
       ) AS ct ON ct.tier_id = tt.id
       WHERE tt.event_id = $1
       GROUP BY tt.id, tt.name, tt.price, tt.quota
       ORDER BY tt.price DESC, tt.name ASC`,
      [eventId]
    );

    tierBreakdown = tierResult.rows.map((r) => ({
      tierId: r.tier_id,
      tierName: r.tier_name,
      price: Number(r.tier_price),
      quota: r.quota,
      sold: r.tickets_sold,
      revenue: Number(r.tier_revenue),
    }));

    totalTicketsSold = tierBreakdown.reduce((sum, t) => sum + t.sold, 0);

    // 3. Detailed bookings list
    const bookingsResult = await pool.query(
      `SELECT
         b.id AS booking_id,
         b.user_id,
         u.full_name AS purchaser_name,
         u.email AS purchaser_email,
         b.status AS booking_status,
         b.total_amount::numeric(10,2) AS total_amount,
         b.created_at,
         COUNT(t.id)::int AS ticket_count,
         COALESCE(STRING_AGG(DISTINCT tt.name, ', '), 'General') AS tier_names
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN tickets t ON t.booking_id = b.id AND t.status != 'CANCELLED'
       LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
       WHERE b.event_id = $1
       GROUP BY b.id, b.user_id, u.full_name, u.email, b.status, b.total_amount, b.created_at
       ORDER BY b.created_at ASC, b.id ASC`,
      [eventId]
    );

    bookingsList = bookingsResult.rows.map((r) => ({
      bookingId: r.booking_id,
      userId: r.user_id,
      purchaserName: r.purchaser_name,
      purchaserEmail: r.purchaser_email,
      status: r.booking_status,
      totalAmount: Number(r.total_amount),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
      ticketCount: r.ticket_count || 1,
      tierNames: r.tier_names,
    }));
  } else {
    // In-memory fallback mode
    const explicitBookings = getBookingRecordsByEvent(eventId);

    if (explicitBookings.length > 0) {
      bookingsList = [...explicitBookings];
    } else {
      // Synthesize bookings from confirmed tickets
      const confirmedTickets = getConfirmedTicketsByEvent(eventId);
      const groups = new Map();

      for (const t of confirmedTickets) {
        const ref = t.bookingReference || t.bookingId || t.ticketId;
        if (!groups.has(ref)) {
          groups.set(ref, {
            bookingId: ref,
            userId: t.userId || 'USR-UNKNOWN',
            purchaserName: t.attendeeName || 'Anonymous',
            purchaserEmail: t.attendeeEmail || '',
            status: t.bookingConfirmationStatus || 'CONFIRMED',
            totalAmount: 0,
            createdAt: t.createdAt || new Date().toISOString(),
            ticketCount: 0,
            tierNames: t.ticketTier || 'General',
          });
        }
        const b = groups.get(ref);
        b.totalAmount += Number(t.price || 0);
        b.ticketCount += 1;
      }

      bookingsList = [...groups.values()];
    }

    const confirmedBookings = bookingsList.filter((b) => b.status === 'CONFIRMED');
    totalRevenue = confirmedBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
    totalBookings = confirmedBookings.length;
    totalTicketsSold = confirmedBookings.reduce((sum, b) => sum + Number(b.ticketCount || 0), 0);

    // Tier breakdown from EventModel tiers
    tierBreakdown = (event.tiers || []).map((t) => ({
      tierId: t.id,
      tierName: t.name,
      price: Number(t.price || 0),
      quota: t.quota || 0,
      sold: t.sold || 0,
      revenue: Number((t.sold || 0) * (t.price || 0)),
    }));

    if (totalTicketsSold === 0 && tierBreakdown.length > 0) {
      totalTicketsSold = tierBreakdown.reduce((sum, t) => sum + t.sold, 0);
    }
  }

  const averageOrderValue = totalBookings > 0
    ? Number((totalRevenue / totalBookings).toFixed(2))
    : 0;

  const summary = {
    totalConfirmedRevenue: Number(totalRevenue.toFixed(2)),
    totalConfirmedBookings: totalBookings,
    totalTicketsSold,
    averageOrderValue,
  };

  const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (format === 'json') {
    return {
      eventId,
      format: 'json',
      contentType: 'application/json',
      filename: `revenue-report-${safeEventId}.json`,
      event,
      summary,
      tierBreakdown,
      bookings: bookingsList,
    };
  }

  if (format === 'pdf') {
    const tierRows = tierBreakdown.map((t) => [
      t.tierName,
      `INR ${t.price.toFixed(2)}`,
      String(t.quota),
      String(t.sold),
      `INR ${t.revenue.toFixed(2)}`,
    ]);

    const bookingRows = bookingsList.map((b) => [
      b.bookingId,
      b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A',
      b.purchaserName,
      b.tierNames,
      String(b.ticketCount),
      `INR ${Number(b.totalAmount).toFixed(2)}`,
      b.status,
    ]);

    const pdfBuffer = generatePdfReport({
      title: 'PassPulse Revenue & Financial Summary Report',
      subtitle: `Official Ticket Sales and Booking Revenue Breakdown for ${event.title}`,
      metadata: {
        Event: event.title,
        Category: event.category,
        Date: event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'N/A',
        Venue: event.venue,
        Status: event.status,
        Generated: new Date().toUTCString(),
      },
      kpis: [
        { label: 'Gross Revenue', value: `INR ${totalRevenue.toFixed(2)}` },
        { label: 'Confirmed Orders', value: String(totalBookings) },
        { label: 'Tickets Sold', value: String(totalTicketsSold) },
        { label: 'Avg Order Value', value: `INR ${averageOrderValue.toFixed(2)}` },
      ],
      secondaryTable: {
        title: 'Tier Performance Summary',
        headers: ['Tier Name', 'Unit Price', 'Quota', 'Sold', 'Tier Revenue'],
        rows: tierRows,
        columnRatios: [28, 18, 16, 16, 22],
      },
      headers: ['Booking ID', 'Date', 'Customer', 'Tier', 'Tickets', 'Amount', 'Status'],
      rows: bookingRows,
      columnRatios: [20, 14, 20, 16, 10, 16, 14],
    });

    return {
      eventId,
      format: 'pdf',
      contentType: 'application/pdf',
      filename: `revenue-report-${safeEventId}.pdf`,
      data: pdfBuffer,
      summary,
    };
  }

  // Default: CSV format
  const headers = [
    'Booking ID',
    'Booking Date',
    'Purchaser Name',
    'Purchaser Email',
    'Ticket Tiers',
    'Ticket Count',
    'Total Amount (INR)',
    'Booking Status',
  ];

  const rows = bookingsList.map((b) => [
    b.bookingId,
    b.createdAt,
    b.purchaserName,
    b.purchaserEmail,
    b.tierNames,
    b.ticketCount,
    Number(b.totalAmount).toFixed(2),
    b.status,
  ]);

  const csvString = generateCsv({ headers, rows });

  return {
    eventId,
    format: 'csv',
    contentType: 'text/csv; charset=utf-8',
    filename: `revenue-report-${safeEventId}.csv`,
    data: csvString,
    summary,
  };
}

module.exports = {
  getEventMetadata,
  generateAttendanceReport,
  generateRevenueReport,
  registerBookingRecord,
  clearBookingRecords,
  getBookingRecordsByEvent,
};
