-- What each person can't eat (restrictions: hard rules) and would rather eat
-- (preferences and spice level: leanings). Values are the enum names in
-- DietaryNeeds.java; keep both lists in step. Existing accounts start with none.
-- "if not exists": the shared Supabase DB got these exact columns before this
-- migration was recorded there.
alter table accounts.profiles
    add column if not exists dietary_restrictions text[] not null default '{}'
        check (dietary_restrictions <@ array['HALAL', 'VEGETARIAN', 'VEGAN', 'NO_PORK', 'NO_BEEF',
            'NUT_ALLERGY', 'SHELLFISH_ALLERGY', 'DAIRY_FREE', 'GLUTEN_FREE', 'EGG_ALLERGY']),
    add column if not exists dietary_preferences text[] not null default '{}'
        check (dietary_preferences <@ array['HEALTHIER', 'LESS_OILY', 'LESS_SWEET', 'LOW_CARB']),
    add column if not exists spice_level text
        check (spice_level in ('NONE', 'MILD', 'MEDIUM', 'HOT'));

comment on column accounts.profiles.spice_level is
    'How much chilli the person enjoys; null when they have not said';
