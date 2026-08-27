export default function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} stars`}
          onClick={() => onChange(n)}
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${
            n <= value ? 'bg-amber-100' : 'bg-white'
          }`}
        >
          <span className={n <= value ? 'text-amber-500' : 'text-black/20'}>★</span>
        </button>
      ))}
    </div>
  )
}
