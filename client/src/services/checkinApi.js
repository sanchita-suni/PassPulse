const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export async function verifyCheckIn({ qrData, eventId }) {
  const response = await fetch(
    `${API_BASE_URL}/api/checkin/verify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        qrData,
        eventId,

        // Temporary until the booking module is connected.
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      }),
    }
  )

  const body = await response.json()

  if (!response.ok) {
    const error = new Error(
      body.message || 'Check-in failed'
    )

    error.code = body.code
    error.status = response.status

    throw error
  }

  return body
}