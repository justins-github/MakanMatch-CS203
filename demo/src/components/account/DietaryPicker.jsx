// Dietary restrictions (can't eat) and preferences (would rather), shared by the
// sign-up form and the profile page. Keys match DietaryNeeds.java in account-service.
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

const toggle = (options, picked, key) =>
  options.map(([k]) => k).filter((k) => (k === key ? !picked.includes(k) : picked.includes(k)))

function ChipGroup({ legend, hint, options, isOn, onToggle, strict = false }) {
  return (
    <fieldset className={`diet-group${strict ? ' strict' : ''}`}>
      <legend>{legend}</legend>
      {hint && <small>{hint}</small>}
      <div className="diet-chips">
        {options.map(([key, label]) => (
          <button key={key} type="button" className="diet-chip" aria-pressed={isOn(key)} onClick={() => onToggle(key)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function DietaryPicker({ value, onChange }) {
  const { restrictions, preferences, spiceLevel } = value
  return (
    <div className="diet">
      <ChipGroup
        legend="Can't eat"
        hint="Religion, ethics or allergies."
        strict
        options={RESTRICTIONS}
        isOn={(k) => restrictions.includes(k)}
        onToggle={(k) => onChange({ ...value, restrictions: toggle(RESTRICTIONS, restrictions, k) })}
      />
      <ChipGroup
        legend="Would rather"
        options={PREFERENCES}
        isOn={(k) => preferences.includes(k)}
        onToggle={(k) => onChange({ ...value, preferences: toggle(PREFERENCES, preferences, k) })}
      />
      <ChipGroup
        legend="Spice"
        hint="Tap again to clear."
        options={SPICE_LEVELS}
        isOn={(k) => spiceLevel === k}
        onToggle={(k) => onChange({ ...value, spiceLevel: spiceLevel === k ? null : k })}
      />
    </div>
  )
}
