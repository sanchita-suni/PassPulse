export function formatDate(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatPrice(value) {
  if (value === null || value === undefined) return 'TBA'
  return Number(value) === 0 ? 'Free' : `Rs ${value}`
}
