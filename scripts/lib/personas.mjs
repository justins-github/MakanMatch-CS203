// The demo community for the Week 13 simulation. Diners have distinct tastes so
// the same venues get different match scores for different people; owners and a
// pending claim give the owner and admin screens something real to show.
//
// taste(dish) returns -1..1: how much this persona likes a seed dish, from its
// curated features. It decides the sentiment they post in the simulation.
//
// The spice-shy diners have a fixed history instead (seed-review-bomb.mjs posts it), so
// the review bomb demo starts from the same place every time.

const HOT = ['tom-yum-goong', 'sambal-chicken-rice', 'ayam-penyet', 'mee-rebus', 'green-curry', 'soto-ayam']
const MILD = ['chwee-kueh-classic', 'batang-fish-soup', 'roasted-chicken-rice', 'begedil', 'fried-fish-beehoon', 'mango-sticky-rice']

export const PERSONAS = [
  {
    username: 'mei_chilli',
    displayName: 'Mei',
    about: 'lives for spice',
    taste: (d) => 2 * (d.spice - 0.45),
    says: { loved: 'love the spice, so shiok', fine: 'decent but could be spicier', disliked: 'too bland for me' },
  },
  {
    username: 'darren_light',
    displayName: 'Darren',
    about: 'eats light',
    taste: (d) => 2 * (0.5 - d.richness),
    says: { loved: 'light and clean, not jelak at all', fine: 'ok, a bit heavy', disliked: 'way too oily and heavy' },
  },
  {
    username: 'priya_explores',
    displayName: 'Priya',
    about: 'wants something new every week',
    taste: (d) => 2 * (d.novelty - 0.45),
    says: { loved: 'never tried anything like it, so interesting', fine: 'familiar but fine', disliked: 'boring, had it a hundred times' },
  },
  {
    username: 'jun_budget',
    displayName: 'Jun',
    about: 'counts every dollar',
    taste: (d) => (d.price <= 5 ? 1 : d.price <= 8.5 ? 0 : -1),
    says: { loved: 'super worth it for the price', fine: 'price is ok', disliked: 'too pricey for what it is' },
  },
  {
    username: 'ahmet_kebab',
    displayName: 'Ahmet',
    about: "runs Turk's Kebab",
    owns: 'turks-kebab',
  },
  {
    username: 'thura_yangon',
    displayName: 'Thura',
    about: 'runs Yangon Flavours',
    owns: 'yangon-flavours',
  },
  {
    username: 'sam_mild',
    displayName: 'Sam',
    about: 'presents the review bomb demo, keeps the spice low',
    history: { dislikes: HOT.slice(0, 4), loves: MILD.slice(0, 4) },
  },
  {
    username: 'weiling_mild',
    displayName: 'Wei Ling',
    about: 'keeps the spice low',
    history: { dislikes: HOT.slice(0, 3), loves: MILD.slice(1, 5) },
  },
  {
    username: 'hafiz_nospice',
    displayName: 'Hafiz',
    about: 'keeps the spice low',
    history: { dislikes: HOT.slice(2, 5), loves: MILD.slice(0, 3) },
  },
  {
    username: 'nadia_mild',
    displayName: 'Nadia',
    about: 'keeps the spice low',
    history: { dislikes: HOT.slice(1, 4), loves: MILD.slice(2, 6) },
  },
  {
    username: 'siti_soto',
    displayName: 'Siti',
    about: 'claims Selegie Soto Corner (waiting for an admin)',
    claims: {
      venueId: 'selegie-soto',
      proof: 'I run the stall with my mother since 2009. UEN 53212345A; call 9123 4567 and ask for Siti, or drop by any weekday before 2pm.',
    },
  },
]

export const personaEmail = (persona) => `${persona.username}@${process.env.SEED_EMAIL_DOMAIN || 'example.com'}`
