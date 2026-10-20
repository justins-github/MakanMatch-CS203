# MakanMatch - web app and recommendation engine

> Setup, the Supabase project, the two Spring services and the seed scripts are
> documented in the [repo-root README](../README.md). This file covers what the
> screens and the recommendation engine do.

Clickable demo of the CS203 project idea: SG food discovery where **an AI learns your
taste and gets its predictions right**. Three genuinely-working beats: (1) rating
dishes trains a live Taste DNA model in front of you, (2) **real data.gov.sg rain
data re-ranks the feed**, and (3) the venue registry is **~21,700 real Singapore F&B
places extracted from Overture Maps** (`server/data/sg_food_places.json`, regenerate
with `node scripts/extract-overture.mjs` from the repo root after each monthly
release), and (4) every venue has a **learned taste vector** (`server/data/venue_vectors.*`,
gitignored - build once with `node scripts/embed-venues.mjs` from the repo root; ~2 min,
one-time ~23 MB model download; the server ranks without the term if the files are
missing). Accounts live in `../account-service`, venues and menus in `../catalog-service`; this
folder is the React app and the Express recommendation engine.

## Run it

Needs Node 20+, JDK 17+ and a filled-in `.env` at the repo root (see the root README).
From the repo root: `npm install`, then `npm run dev` starts all four processes
(account-service :8082, catalog-service :8083, engine :3001, web :5203) and opens on
a real sign-in screen. `npm test` runs the engine tests (`node --test`).

## What each screen demonstrates

- **Navigation** - the same five tabs at the bottom for everyone (For you · Kakis ·
  a raised **+** for Review · Taste DNA · Me), a top bar with the weather chip and
  your avatar, and a splash screen with the logo while the session loads. Owner and
  admin tools (My venues, Admin, View as) open from **Me**, so the bar never grows.

- **For you** - a two-button landing: **Find me a restaurant** returns the top-10
  matches walkable from SMU (≤20 min, real geometry), **Surprise me** returns one
  experimental pick from a cuisine your Taste DNA hasn't grown into yet (with an
  "Another surprise" reroll). Every venue gets a personalised Match Score with a
  confidence indicator (Overture record confidence + data age + review volume) and
  "why" chips - but only the chips its data supports: Overture-seeded venues show
  cuisine + distance, community-enriched ones add spice/heartiness/price/shelter,
  and an information cap keeps a barebones venue from claiming a 99% match. The
  weather chip in the top bar shows the *live* two-hour forecast from data.gov.sg; when it rains (or an
  admin presses **Simulate rain**), venues *known* to be sheltered get boosted and the
  chips explain the re-rank. Halal and vegetarian needs from your profile are
  dealbreakers (`server/dietary.js`).
- **With friends** - the switch at the top of For you. Pick kakis (or a saved group)
  and Find / Surprise score every venue for everyone (`server/groupMatch.js`): the
  card's sticker is the group average, a row shows each person's own score, and the
  list aims for nobody below 75%, relaxing 5 points at a time only when fewer than
  three places pass. Anyone's halal or vegetarian needs apply to the whole table.
- **Kakis** - add people by username (they accept), see requests, remove kakis, and
  save groups. Lives in account-service; the engine asks it who your kakis are.
- **Review** - starts blank with just a search bar over all ~21,700 venues:
  server-side typeahead (200 ms debounce, min 2 chars, AbortController cancellation,
  top-8 results - the client never loads the full dataset). Results bold exactly the
  part of the name you typed, rank by text relevance blended with your match %, and
  same-named chain outlets are disambiguated by their location. Then the Beli-style
  flow: pick a dish from the venue's live menu (catalog-service) - or **add one that's not
  listed** (it joins the menu as community data: "the menu emerges from reviews"; on
  Overture venues the menu starts empty and the community fills it) - then you pick a
  sentiment (Loved / Fine / Not for me), settle up to three **head-to-head duels**
  against dishes you've already ranked (binary insertion into your personal 1-10
  leaderboard), and write a **text review**. The AI's predicted score stays hidden
  until you post, then it's shown next to yours so it can't anchor your rating. Three learning channels, all real and
  unit-tested (`server/learn.js`): the sentiment drives moving-average nudges
  (α=0.25); every duel is a preference training pair (α=0.12 toward the winner's
  features); and the text goes through **RAG-lite retrieval** over your own review
  corpus (`server/reviewText.js`) - a transparent lexicon spots taste signals and
  scales the adjustment by how many past reviews carry the same signal, so writing
  "I love the spice" across many reviews compounds ("7 of your reviews mention
  loving the spice"). The delta panel explains every change; the **model accuracy**
  meter (100 − mean prediction error) improves as the model calibrates. Everything is
  per account and saved in Postgres (the `taste` schema); **Reset my taste** forgets only
  your own reviews and profile. Production
  upgrade path for the text channel: pgvector embeddings + an LLM.
- **Taste DNA** - the *live* learned profile: six dimensions (radar) + per-cuisine
  affinities + a satiation note ("recently eaten" cuisines are temporarily penalised).
  Its history chart shows the latest profile learned each day, retained for up to 30
  days. **Reset my taste** clears the history along with reviews and rankings.
- **Mood chips** - switched off for now; the strip at the bottom of For you is kept
  free for what comes next. The engine still accepts `mood` (soupy / spicy / light).

## How the match score works (one slide's worth)

`score = 50 + 25·cuisineAffinity [+ 15·spiceFit + 10·richnessFit − pricePenalty]ᵂᴴᴱᴺ
ᴷᴺᴼᵂᴺ + 12·tasteSimilarity − distancePenalty − satiationPenalty ± contextModifiers`, clamped to 5-99 and
**capped by information**: `cap = 80 + 4·knownAttributes + min(reviews, 5)`. Every
applied term emits a human-readable chip - the scoring **is** the explanation.
Novelty (for Surprise me) is computed from cuisine affinity, never hand-authored.
`tasteSimilarity` is the cosine between the user's taste vector (weighted mean of the
prior vectors of venues they ranked above 5/10, `server/vectors.js`) and the venue's
prior vector (MiniLM sentence embedding of name + category + dish gloss, built offline
by `scripts/embed-venues.mjs`); it fires only when both exist and emits
"Similar to places you've rated well" above 0.75.
The ten curated venues in `server/data/venues.json` merge onto their real Overture
records at startup (`server/registry.js`) and keep their community taste vectors; in
the real product those come from dish reviews.

Demo user profile: `server/match.js` (`DEMO_USER`). Curated venues:
`server/data/venues.json` - tweak freely. Overture snapshot:
`server/data/sg_food_places.json` - regenerate, don't hand-edit.
