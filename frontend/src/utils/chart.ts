export interface ChartPoint { label: string; value: number | null }

export function chartGeometry(points: ChartPoint[], availableWidth = 0, fractional = true) {
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  const raw = (high - low || 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(fractional ? 0.01 : 1, magnitude * ([1, 2, 5, 10].find(value => value >= raw / magnitude) ?? 10))
  const first = Math.floor(low / step)
  const last = Math.max(first + 1, Math.ceil(high / step))
  const min = first * step
  const max = last * step
  const ticks = Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step)
  const left = 66, right = 20, top = 30, bottom = 216
  const width = Math.max(280, availableWidth, points.length > 2 ? points.length * 112 + left + right : 0)
  const height = 289
  const slot = (width - left - right) / Math.max(points.length, 1)
  const y = (n: number) => top + (max - n) / (max - min) * (bottom - top)
  const x = (index: number) => left + (index + 0.5) * slot
  const segments: { x: number; y: number }[][] = []
  let segment: { x: number; y: number }[] = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (segment.length) segments.push(segment)
      segment = []
    } else segment.push({ x: x(index), y: y(point.value) })
  })
  if (segment.length) segments.push(segment)
  return { width, height, left, right, bottom, slot, ticks, y, x, zero: y(0), segments }
}
