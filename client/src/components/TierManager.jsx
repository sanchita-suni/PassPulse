import { useState } from 'react'
import { addTier, updateTier, removeTier } from '../services/eventsApi'
import { formatPrice } from '../utils/format'

const BLANK_TIER = { name: '', price: '', quota: '', maxPerOrder: 5 }

/**
 * FR-007: add, re-price and remove ticket tiers for one event.
 */
function TierManager({ event, token, onChanged }) {
  const [form, setForm] = useState(BLANK_TIER)
  const [error, setError] = useState(null)
  const locked = event.status === 'CANCELLED' || event.status === 'COMPLETED'
  const allocated = event.tiers.reduce((sum, t) => sum + t.quota, 0)

  async function run(action) {
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleAdd(e) {
    e.preventDefault()
    run(async () => {
      await addTier(
        event.id,
        {
          name: form.name,
          price: form.price === '' ? '' : Number(form.price),
          quota: Number(form.quota),
          maxPerOrder: Number(form.maxPerOrder),
        },
        token
      )
      setForm(BLANK_TIER)
    })
  }

  function handlePrice(tier) {
    const value = window.prompt(`New price for ${tier.name}`, String(tier.price))
    if (value === null) return
    run(() => updateTier(event.id, tier.id, { price: Number(value) }, token))
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted">
        Allocated {allocated} of {event.capacity} seats across {event.tiers.length} tier
        {event.tiers.length === 1 ? '' : 's'}
      </div>
      {error && <div className="notice error" style={{ marginTop: 8 }}>{error}</div>}
      {event.tiers.length > 0 && (
        <table className="tier-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Price</th>
              <th>Quota</th>
              <th>Sold</th>
              <th>Max per order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {event.tiers.map((tier) => (
              <tr key={tier.id}>
                <td>{tier.name}</td>
                <td>{formatPrice(tier.price)}</td>
                <td>{tier.quota}</td>
                <td>{tier.sold}</td>
                <td>{tier.maxPerOrder}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn" disabled={locked} onClick={() => handlePrice(tier)}>
                    Price
                  </button>{' '}
                  <button
                    type="button"
                    className="btn"
                    disabled={locked || tier.sold > 0}
                    onClick={() => run(() => removeTier(event.id, tier.id, token))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!locked && (
        <form className="form-grid" style={{ marginTop: 12 }} onSubmit={handleAdd}>
          <label>
            Tier name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </label>
          <label>
            Quota
            <input
              type="number"
              min="1"
              value={form.quota}
              onChange={(e) => setForm({ ...form, quota: e.target.value })}
              required
            />
          </label>
          <label>
            Max per order
            <input
              type="number"
              min="1"
              max="5"
              value={form.maxPerOrder}
              onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })}
            />
          </label>
          <div className="catalog-actions">
            <button type="submit" className="btn btn-primary">Add tier</button>
          </div>
        </form>
      )}
    </div>
  )
}

export default TierManager
