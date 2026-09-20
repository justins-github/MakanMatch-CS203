const MOODS = [
  { id: 'soupy', label: '🍜 Soupy' },
  { id: 'spicy', label: '🌶️ Spicy' },
  { id: 'light', label: '🥗 Light' },
]

export default function MoodBar({ mood, onMood }) {
  return (
    <div className="moodbar" role="group" aria-label="What are you in the mood for?">
      {MOODS.map((m) => (
        <button
          key={m.id}
          className="chip"
          aria-pressed={mood === m.id}
          onClick={() => onMood(mood === m.id ? 'none' : m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
