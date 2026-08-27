export interface QuickNoteChipsProps {
  options: string[]
  selected: string[]
  onToggle: (note: string) => void
}

export default function QuickNoteChips({ options, selected, onToggle }: QuickNoteChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full px-4 py-3 text-sm font-bold ${
              isSelected ? 'bg-ink text-white' : 'bg-white text-black/70'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
