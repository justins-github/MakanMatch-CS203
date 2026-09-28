# MakanMatch - pitch demo

Clickable demo of the CS203 project idea: SG food discovery where **an AI learns your
taste and gets its predictions right**. Three genuinely-working beats: (1) rating
dishes trains a live Taste DNA model in front of you, (2) **real data.gov.sg rain
data re-ranks the feed**, and (3) the venue registry is **~21,700 real Singapore F&B
places extracted from Overture Maps** (`server/data/sg_food_places.json`, regenerate
with `node scripts/extract-overture.mjs` from the repo root after each monthly
release), and (4) every venue has a **learned taste vector** (`server/data/venue_vectors.*`,
gitignored - build once with `node scripts/embed-venues.mjs` from the repo root; ~2 min,
one-time ~23 MB model download; the server ranks without the term if the files are
missing). It is not the real architecture (no Spring Boot, no DB, no auth); see
`../docs/sprint-plan.md` for the plan.

## Run it

Prereq: Node 18+. From the repo root (or from `demo/`):

```
npm install
npm run dev
```

Open http://localhost:5203 (5203 for CS203; port 203 itself is privileged on macOS/Linux). `npm run dev` starts both halves via
`concurrently`: the Express API on :3001 (auto-restarted by **nodemon**) and the Vite
React app on :5203 (hot reload). `npm test` runs the match-engine tests (`node --test`).

The app opens on a **mock sign-in screen** (`src/components/Login.jsx`). There is no
auth backend yet, so any email + password signs you in; the session is kept in
`sessionStorage` and **Log out** in the header returns you to the sign-in screen.

## What each screen demonstrates

- **For you** - a two-button landing: **Find me a restaurant** returns the top-10
  matches walkable from SMU (≤20 min, real geometry), **Surprise me** returns one
  experimental pick from a cuisine your Taste DNA hasn't grown into yet (with an
  "Another surprise" reroll). Every venue gets a personalised Match Score with a
  confidence indicator (Overture record confidence + data age + review volume) and
  "why" chips - but only the chips its data supports: Overture-seeded venues show
  cuisine + distance, community-enriched ones add spice/heartiness/price/shelter,
  and an information cap keeps a barebones venue from claiming a 99% match. The
  banner shows the *live* two-hour forecast from data.gov.sg; when it rains (or you
  press **Simulate rain**), venues *known* to be sheltered get boosted and the chips
  explain the re-rank.
- **Review** - starts blank with just a search bar over all ~21,700 venues:
  server-side typeahead (200 ms debounce, min 2 chars, AbortController cancellation,
  top-8 results - the client never loads the full dataset). Results bold exactly the
  part of the name you typed, rank by text relevance blended with your match %, and
  same-named chain outlets are disambiguated by their location. Then the Beli-style
  flow: pick a dish - or **add one that's not listed** (user dishes join the menu:
  "the menu emerges from reviews"; on Overture venues the menu starts empty and the
  community fills it) - then the AI states its predicted score, you pick a
  sentiment (Loved / Fine / Not for me), settle up to three **head-to-head duels**
  against dishes you've already ranked (binary insertion into your personal 1-10
  leaderboard), and write a **text review**. Three learning channels, all real and
  unit-tested (`server/learn.js`): the sentiment drives moving-average nudges
  (α=0.25); every duel is a preference training pair (α=0.12 toward the winner's
  features); and the text goes through **RAG-lite retrieval** over your own review
  corpus (`server/reviewText.js`) - a transparent lexicon spots taste signals and
  scales the adjustment by how many past reviews carry the same signal, so writing
  "I love the spice" across many reviews compounds ("7 of your reviews mention
  loving the spice"). The delta panel explains every change; the **model accuracy**
  meter (100 − mean prediction error) improves as the model calibrates. State is
  in-memory - **Reset demo** (or a server restart) returns to baseline. Production
  upgrade path for the text channel: pgvector embeddings + an LLM.
- **Taste DNA** - the *live* learned profile: six dimensions (radar) + per-cuisine
  affinities + a satiation note ("recently eaten" cuisines are temporarily penalised).
  Watch it change as you rate.
- **Mood chips** - one-tap context ("soupy / spicy / light"); they reward venues the
  community has confirmed fit and leave unmapped venues untouched. (The old Surprise
  mood chip became the Surprise me button.)

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
