export interface StatCardProps {
  value: string | number
  label: string
  tone?: 'default' | 'plum'
  meta?: string
}

export default function StatCard({ value, label, tone = 'default', meta }: StatCardProps) {
  const isPlum = tone === 'plum'
  return (
    <div
      className={`rounded-2xl p-5 ${
        isPlum ? 'bg-plum-light text-white' : 'bg-white text-ink'
      }`}
    >
      <p className="text-3xl font-extrabold">{value}</p>
      <p className={`mt-2 text-sm font-medium ${isPlum ? 'text-white/90' : ''}`}>{label}</p>
      {meta && (
        <p className={`mt-3 text-xs ${isPlum ? 'text-white/70' : 'text-black/40'}`}>{meta}</p>
      )}
    </div>
  )
}
