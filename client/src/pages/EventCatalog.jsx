import { useEffect, useState } from 'react'
import { searchEvents, fetchCategories } from '../services/eventsApi'
import { formatDate, formatPrice } from '../utils/format'
import JourneySteps from '../components/JourneySteps'
import './EventCatalog.css'

const EMPTY_FILTERS = {
  search: '',
  category: '',
  venue: '',
  startDate: '',
  endDate: '',
  minPrice: '',
  maxPrice: '',
}

/**
 * FR-004: public event catalog with keyword, category, venue, date and price filters.
 */
function EventCatalog({ onOpenEvent }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [categories, setCategories] = useState([])
  const [result, setResult] = useState({ events: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function runSearch(activeFilters) {
    setLoading(true)
    setError(null)
    try {
      const data = await searchEvents(activeFilters)
      setResult({ events: data.events, total: data.total })
    } catch (err) {
      setError(err.message)
      setResult({ events: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    searchEvents(EMPTY_FILTERS)
      .then((data) => {
        if (active) setResult({ events: data.events, total: data.total })
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    fetchCategories()
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]))
    return () => {
      active = false
    }
  }, [])

  function update(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    runSearch(filters)
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS)
    runSearch(EMPTY_FILTERS)
  }

  return (
    <section className="catalog">
      <JourneySteps current={1} />
      <h1>Discover events</h1>
      <p className="muted">Search events that are open for booking.</p>

      <form className="catalog-filters" onSubmit={handleSubmit} aria-label="Event filters">
        <label>
          Keyword
          <input
            type="search"
            value={filters.search}
            placeholder="Title, venue, topic"
            onChange={(e) => update('search', e.target.value)}
          />
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(e) => update('category', e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Venue
          <input type="text" value={filters.venue} onChange={(e) => update('venue', e.target.value)} />
        </label>
        <label>
          From
          <input type="date" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
        </label>
        <label>
          Min price
          <input type="number" min="0" value={filters.minPrice} onChange={(e) => update('minPrice', e.target.value)} />
        </label>
        <label>
          Max price
          <input type="number" min="0" value={filters.maxPrice} onChange={(e) => update('maxPrice', e.target.value)} />
        </label>
        <div className="catalog-actions">
          <button type="submit" className="btn btn-primary">Search</button>
          <button type="button" className="btn" onClick={handleReset}>Reset</button>
        </div>
      </form>

      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <p className="muted">Loading events...</p>
      ) : result.total === 0 ? (
        <div className="empty-state">No events found</div>
      ) : (
        <>
          <p className="muted">{result.total} event{result.total === 1 ? '' : 's'}</p>
          <div className="event-grid">
            {result.events.map((ev) => (
              <button type="button" key={ev.id} className="event-card" onClick={() => onOpenEvent(ev.id)}>
                <span className="chip">{ev.category}</span>
                <h3>{ev.title}</h3>
                <span>{formatDate(ev.eventDate)}</span>
                <span className="muted">{ev.venue}</span>
                <span>
                  {ev.minPrice === ev.maxPrice
                    ? formatPrice(ev.minPrice)
                    : `${formatPrice(ev.minPrice)} to ${formatPrice(ev.maxPrice)}`}
                </span>
                <span className="muted">
                  {ev.seatsAvailable > 0 ? `${ev.seatsAvailable} seats left` : 'Sold out'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default EventCatalog
