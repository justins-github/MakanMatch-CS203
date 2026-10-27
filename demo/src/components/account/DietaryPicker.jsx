// Dietary restrictions (can't eat) and preferences (would rather), shared by the
// sign-up form and the profile page. Keys match DietaryNeeds.java in account-service.
import { Accordion, Fold } from '../Accordion.jsx'
import './account.css'

const RESTRICTIONS = [
  ['HALAL', 'Halal'],
  ['VEGETARIAN', 'Vegetarian'],
  ['VEGAN', 'Vegan'],
  ['NO_PORK', 'No pork'],
  ['NO_BEEF', 'No beef'],
  ['NUT_ALLERGY', 'Nut allergy'],
  ['SHELLFISH_ALLERGY', 'Shellfish allergy'],
  ['DAIRY_FREE', 'Dairy-free'],
  ['GLUTEN_FREE', 'Gluten-free'],
  ['EGG_ALLERGY', 'Egg allergy'],
]

const PREFERENCES = [
  ['HEALTHIER', 'Healthier options'],
  ['LESS_OILY', 'Less oily'],
  ['LESS_SWEET', 'Less sweet'],
  ['LOW_CARB', 'Low-carb'],
]

const SPICE_LEVELS = [
  ['NONE', 'No spice'],
  ['MILD', 'Mild'],
  ['MEDIUM', 'Medium'],
  ['HOT', 'Hot'],
]

export const NO_DIETARY_NEEDS = { restrictions: [], preferences: [], spiceLevel: null }

// Lists are always in option order (as the server returns them), so joining compares them.
export const sameDietaryNeeds = (a, b) =>
  a.spiceLevel === b.spiceLevel &&
  a.restrictions.join() === b.restrictions.join() &&
  a.preferences.join() === b.preferences.join()

export const countDietaryNeeds = (d) => d.restrictions.length + d.preferences.length + (d.spiceLevel ? 1 : 0)

const labels = (options, picked) => options.filter(([k]) => picked.includes(k)).map(([, label]) => label)

// Everything picked, in the order the picker shows it: ['No pork', 'Less oily', 'No spice'].
export const dietaryLabels = (d) => [
  ...labels(RESTRICTIONS, d.restrictions),
  ...labels(PREFERENCES, d.preferences),
  ...labels(SPICE_LEVELS, d.spiceLevel ? [d.spiceLevel] : []),
]

const toggle = (options, picked, key) =>
  options.map(([k]) => k).filter((k) => (k === key ? !picked.includes(k) : picked.includes(k)))

// Inside a fold the fold's header names the group, so the legend moves to aria-label.
function ChipGroup({ legend, hint, options, picked, onToggle, strict = false, folded = false }) {
  return (
    <fieldset className={`diet-group${strict ? ' strict' : ''}`} aria-label={folded ? legend : undefined}>
      {!folded && <legend>{legend}</legend>}
      {hint && <small>{hint}</small>}
      <div className="diet-chips">
        {options.map(([key, label]) => (
          <button key={key} type="button" className="diet-chip" aria-pressed={picked.includes(key)} onClick={() => onToggle(key)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// `folded` (the profile) puts each group in its own fold, one open at a time.
export default function DietaryPicker({ value, onChange, folded = false }) {
  const { restrictions, preferences, spiceLevel } = value
  const groups = [
    {
      id: 'restrictions',
      legend: "Can't eat",
      hint: 'Religion, ethics or allergies.',
      strict: true,
      options: RESTRICTIONS,
      picked: restrictions,
      onToggle: (k) => onChange({ ...value, restrictions: toggle(RESTRICTIONS, restrictions, k) }),
    },
    {
      id: 'preferences',
      legend: 'Would rather',
      options: PREFERENCES,
      picked: preferences,
      onToggle: (k) => onChange({ ...value, preferences: toggle(PREFERENCES, preferences, k) }),
    },
    {
      id: 'spice',
      legend: 'Spice',
      hint: 'Tap again to clear.',
      options: SPICE_LEVELS,
      picked: spiceLevel ? [spiceLevel] : [],
      onToggle: (k) => onChange({ ...value, spiceLevel: spiceLevel === k ? null : k }),
    },
  ]

  if (!folded) {
    return (
      <div className="diet">
        {groups.map(({ id, ...group }) => (
          <ChipGroup key={id} {...group} />
        ))}
      </div>
    )
  }

  return (
    <div className="diet folded">
      <Accordion>
        {groups.map(({ id, ...group }) => (
          <Fold key={id} id={id} sub title={group.legend} summary={labels(group.options, group.picked).join(', ') || 'Nothing picked'}>
            <ChipGroup {...group} folded />
          </Fold>
        ))}
      </Accordion>
    </div>
  )
}
