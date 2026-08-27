function pseudoRandom(seed: string, index: number): number {
  let hash = 0
  const str = `${seed}-${index}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash % 100) / 100
}

export default function WaveformBar({ seed, barCount = 24 }: { seed: string; barCount?: number }) {
  return (
    <div className="flex h-10 items-end gap-1">
      {Array.from({ length: barCount }).map((_, i) => {
        const height = 20 + pseudoRandom(seed, i) * 80
        return (
          <span
            key={i}
            style={{ height: `${height}%` }}
            className={`w-1 rounded-full ${i < barCount * 0.6 ? 'bg-plum-light' : 'bg-plum-light/30'}`}
          />
        )
      })}
    </div>
  )
}
