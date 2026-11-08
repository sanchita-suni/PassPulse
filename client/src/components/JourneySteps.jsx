const STEPS = ['Find event', 'Choose tickets', 'Checkout', 'Confirmed']

/**
 * NFR-005: shows where the attendee is in the 4-screen booking journey.
 */
function JourneySteps({ current }) {
  return (
    <ol
      aria-label="Booking progress"
      style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0, margin: '0 0 16px', flexWrap: 'wrap' }}
    >
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i + 1 === current ? 'step' : undefined}
          className="step-indicator"
          style={{ opacity: i + 1 <= current ? 1 : 0.4 }}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  )
}

export default JourneySteps
