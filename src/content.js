// All game content and tuning for Due at 11:59.
// Shared by the server (src/game.js). The client only ever receives
// generated task payloads, never this whole file.

export const STATIONS = {
  research: { id: 'research', name: 'Research', emoji: '🔎' },
  write: { id: 'write', name: 'Write', emoji: '✍️' },
  design: { id: 'design', name: 'Design', emoji: '🎨' },
  edit: { id: 'edit', name: 'Edit', emoji: '✅' },
};
export const STATION_IDS = ['research', 'write', 'design', 'edit'];

// minStep: fraction of the round after which this assignment may appear.
export const ASSIGNMENT_TYPES = [
  { kind: 'poster', title: 'Lab Poster', emoji: '🧪', steps: ['research', 'design'], minAt: 0 },
  { kind: 'reflection', title: 'Group Reflection', emoji: '💭', steps: ['write', 'edit'], minAt: 0 },
  { kind: 'infographic', title: 'Infographic', emoji: '🗺️', steps: ['research', 'design'], minAt: 0 },
  { kind: 'summary', title: 'Reading Summary', emoji: '📖', steps: ['research', 'write'], minAt: 0 },
  { kind: 'makeover', title: 'Slide Makeover', emoji: '🖼️', steps: ['design', 'edit'], minAt: 0 },
  { kind: 'caption', title: 'Poster Caption', emoji: '🏷️', steps: ['write', 'design'], minAt: 0 },
  { kind: 'proofread', title: 'Proofread Request', emoji: '🔍', steps: ['edit'], minAt: 0 },
  { kind: 'citations', title: 'Citation Check', emoji: '📚', steps: ['research', 'edit'], minAt: 0 },
  { kind: 'essay', title: 'Essay', emoji: '📝', steps: ['research', 'write', 'edit'], minAt: 0.1 },
  { kind: 'deck', title: 'Pitch Deck', emoji: '📊', steps: ['research', 'design', 'edit'], minAt: 0.1 },
  { kind: 'lab', title: 'Lab Report', emoji: '🔬', steps: ['research', 'write', 'design'], minAt: 0.2 },
  { kind: 'presentation', title: 'Presentation', emoji: '🎤', steps: ['research', 'write', 'design', 'edit'], minAt: 0.35 },
  { kind: 'final', title: 'FINAL PAPER', emoji: '🎓', steps: ['research', 'write', 'design', 'edit'], minAt: 0.6, rare: true },
];

export const DIFFICULTY = {
  freshman: {
    id: 'freshman', label: 'Freshman', blurb: 'Chill. Perfect for your first game.',
    stepTime: 24000, baseTime: 16000, load: 0.55, eventGap: [40000, 55000],
    researchOptions: 4, smartRouting: true, botStep: [3600, 5200],
  },
  sophomore: {
    id: 'sophomore', label: 'Sophomore', blurb: 'The normal amount of chaos.',
    stepTime: 20000, baseTime: 14000, load: 0.7, eventGap: [30000, 42000],
    researchOptions: 4, smartRouting: true, botStep: [3200, 4600],
  },
  junior: {
    id: 'junior', label: 'Junior', blurb: 'Tighter deadlines. Work lands on the wrong desk.',
    stepTime: 16000, baseTime: 11000, load: 0.82, eventGap: [24000, 34000],
    researchOptions: 4, smartRouting: false, botStep: [2900, 4200],
  },
  senior: {
    id: 'senior', label: 'Senior', blurb: 'Finals week. Good luck.',
    stepTime: 13000, baseTime: 9000, load: 0.95, eventGap: [17000, 26000],
    researchOptions: 5, smartRouting: false, botStep: [2600, 3800],
  },
};
export const LENGTHS = [120, 180, 270];

// How bots behave. speed multiplies how long a task takes; pause is the gap
// between actions; mistake is the chance of passing a folder to the wrong person.
// Teammate bots use "medium". The rival-* levels drive the rival group.
export const BOT_LEVELS = {
  easy: { id: 'easy', speed: 0.55, pause: [150, 400], chat: [250, 450], mistake: 0 },
  medium: { id: 'medium', speed: 1, pause: [450, 1000], chat: [500, 900], mistake: 0 },
  hard: { id: 'hard', speed: 2.1, pause: [1100, 2000], chat: [1100, 1700], mistake: 0.15 },
  // Rivals work at the same base pace on every difficulty (tuned with test/rival-tune.mjs):
  // at Sophomore a player with 3 bot teammates scores about 3.9 and four humans about 3.4;
  // a group of 4 rivals scores about 2.7 (easy), 3.5 (medium) and 3.9 (hard).
  'rival-easy': { id: 'rival-easy', speed: 2.5, pause: [1000, 1800], chat: [1200, 1800], mistake: 0.09, baseStep: [3200, 4600] },
  'rival-medium': { id: 'rival-medium', speed: 2.0, pause: [1100, 2000], chat: [800, 1200], mistake: 0.15, baseStep: [3200, 4600] },
  'rival-hard': { id: 'rival-hard', speed: 1.5, pause: [750, 1400], chat: [500, 800], mistake: 0.06, baseStep: [3200, 4600] },
};

// A rival bot group races your group on the same kind of work.
export const RIVAL_LEVELS = ['off', 'easy', 'medium', 'hard'];
export const RIVAL_NAME = 'The Overachievers';

export const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐯', '🐙', '🦄', '🐨'];
export const COLORS = ['#FF7A6B', '#3FD3C6', '#FFD24D', '#9B8CFF', '#FF9F43', '#5AA9FF', '#39D98A', '#FF6FD8'];
export const BOT_NAMES = ['Ada', 'Alan', 'Grace', 'Marie', 'Nikola', 'Rosalind', 'Carl', 'Katherine'];
export const FUN_NAMES = [
  'Night Owl', 'Sleepy Scholar', 'Coffee Addict', 'Deadline Dodger', 'Citation Needed',
  'Snack Captain', 'Tab Hoarder', 'Highlighter Hero', 'Group Chat Ghost', 'Midnight Oil',
];

// ---------------------------------------------------------------- topics
// Every topic has matching content for the write, edit and design steps,
// so a "History Essay on Ancient Egypt" really is about Egypt all the way through.
export const TOPICS = [
  {
    id: 'egypt', name: 'Ancient Egypt', emoji: '🏺',
    write: ['Ancient Egyptians built pyramids as royal tombs.', 'Workers hauled huge stone blocks up long ramps.', 'The Great Pyramid took about twenty years to finish.'],
    edit: ['The pyramids were definitely built as tombs for kings.', 'Historians believe thousands of workers built them.'],
    design: { prompt: 'Show when each pyramid was built', answer: 'timeline' },
  },
  {
    id: 'plants', name: 'Photosynthesis', emoji: '🌱',
    write: ['Leaves soak up sunlight.', 'The plant uses that energy to turn water and CO₂ into sugar.', 'Oxygen is released as a by-product.'],
    edit: ['Plants receive energy from sunlight to grow.', 'Photosynthesis is necessary for almost all life on Earth.'],
    design: { prompt: 'Show the steps a plant uses to make food', answer: 'flow' },
  },
  {
    id: 'econ', name: 'Supply & Demand', emoji: '💰',
    write: ['A new phone launches and everyone wants one.', 'Stores run low, so the price stays high.', 'Months later, demand drops and so does the price.'],
    edit: ['Prices usually rise when demand is higher than supply.', 'A business must believe people will buy its product.'],
    design: { prompt: 'Show how price and demand relate', answer: 'scatter' },
  },
  {
    id: 'water', name: 'The Water Cycle', emoji: '💧',
    write: ['The sun heats water in oceans and lakes.', 'The water evaporates and forms clouds.', 'Later it falls back down as rain or snow.'],
    edit: ['Water vapor turns into clouds at lower temperatures.', 'Rain returns water to the environment again and again.'],
    design: { prompt: 'Show how water moves around the planet', answer: 'flow' },
  },
  {
    id: 'reefs', name: 'Coral Reefs', emoji: '🐠',
    write: ['Coral reefs cover less than 1% of the ocean floor.', 'Yet they support about a quarter of all marine species.', "That's why protecting them matters so much."],
    edit: ['Warmer water temperatures can turn coral white.', 'Reefs are home to thousands of different species.'],
    design: { prompt: 'Show where the biggest reefs are', answer: 'map' },
  },
  {
    id: 'sleep', name: 'Student Sleep', emoji: '😴',
    write: ['We surveyed 50 students about their sleep.', 'Most said they sleep less than seven hours a night.', 'This suggests late deadlines are costing us rest.'],
    edit: ['Most students said they probably need more sleep.', 'Staying up until 3 AM is not a strategy.'],
    design: { prompt: 'Show what share of students sleep under 7 hours', answer: 'pie' },
  },
  {
    id: 'volcano', name: 'Volcanoes', emoji: '🌋',
    write: ['Magma rises through cracks in the crust.', 'Pressure slowly builds beneath the surface.', 'Finally, the volcano erupts.'],
    edit: ['Scientists believe some eruptions can be predicted.', 'The eruption occurred early in the morning.'],
    design: { prompt: 'Show where active volcanoes are', answer: 'map' },
  },
  {
    id: 'bees', name: 'Honeybees', emoji: '🐝',
    write: ['A bee lands on a flower to collect nectar.', 'Pollen sticks to its fuzzy body.', 'At the next flower, some pollen rubs off and pollinates it.'],
    edit: ['Honeybees are really important for growing food.', 'A single hive can hold thousands of bees.'],
    design: { prompt: 'Compare how much honey five hives made', answer: 'bar' },
  },
  {
    id: 'rome', name: 'The Roman Empire', emoji: '🏛️',
    write: ['Rome began as a small city-state.', 'Over centuries, it conquered much of Europe.', 'Eventually, the empire split apart and declined.'],
    edit: ['The Roman government built roads across Europe.', 'The beginning of Rome is surrounded by legends.'],
    design: { prompt: 'Show key events from founding to fall', answer: 'timeline' },
  },
  {
    id: 'social', name: 'Social Media', emoji: '📱',
    write: ['Apps are designed to keep you scrolling.', 'Endless feeds make it hard to stop.', 'Setting a daily time limit can help.'],
    edit: ['Our research found students check their phones constantly.', 'Notifications are especially distracting during class.'],
    design: { prompt: 'Compare hours spent on each app per day', answer: 'bar' },
  },
  {
    id: 'solar', name: 'Solar Power', emoji: '☀️',
    write: ['Solar panels capture energy from sunlight.', 'An inverter turns it into electricity for the home.', 'Extra power can be stored in a battery for later.'],
    edit: ['Solar energy is better for the environment than coal.', 'Panels work best when they receive direct sunlight.'],
    design: { prompt: 'Show how solar use grew since 2000', answer: 'line' },
  },
  {
    id: 'moon', name: 'The Moon Landing', emoji: '🚀',
    write: ['In July 1969, Apollo 11 launched from Florida.', 'Four days later, the lunar module landed on the Moon.', 'Then Neil Armstrong took his famous first step.'],
    edit: ['The Apollo 11 mission was a huge success.', 'The astronauts collected rocks to bring back to Earth.'],
    design: { prompt: 'Show the mission day by day', answer: 'timeline' },
  },
  {
    id: 'space', name: 'Black Holes', emoji: '🕳️',
    write: ['A giant star finally runs out of fuel.', 'Its core collapses under its own gravity.', 'A black hole can form where the star once was.'],
    edit: ['Light cannot escape a black hole, which makes it hard to see.', 'Scientists believe most galaxies have one at their center.'],
    design: { prompt: 'Show how star size relates to lifespan', answer: 'scatter' },
  },
  {
    id: 'jazz', name: 'History of Jazz', emoji: '🎷',
    write: ['Jazz grew out of New Orleans in the early 1900s.', 'It mixed blues, ragtime, and brass band music.', 'Soon it spread to clubs across the country.'],
    edit: ['Jazz musicians often improvise their solos.', 'Its beginning is usually traced to New Orleans.'],
    design: { prompt: 'Show where jazz spread, city by city', answer: 'map' },
  },
  {
    id: 'silk', name: 'The Silk Road', emoji: '🐫',
    write: ['Merchants carried silk west from China.', 'Along the way, they traded spices and ideas.', 'Over centuries, the route connected many cultures.'],
    edit: ['Merchants traded silk, spices, and knowledge.', 'The route connected different cultures for centuries.'],
    design: { prompt: 'Compare the value of goods traded', answer: 'bar' },
  },
  {
    id: 'ml', name: 'Machine Learning', emoji: '🤖',
    write: ['A model studies thousands of examples.', 'It learns the patterns hidden in that data.', 'Then it uses those patterns to make predictions.'],
    edit: ['The model achieved better results with more data.', 'Good data is necessary for accurate predictions.'],
    design: { prompt: 'Show how accuracy improved with more data', answer: 'line' },
  },
  {
    id: 'climate', name: 'Climate Change', emoji: '🌍',
    write: ['Burning fossil fuels releases carbon dioxide.', 'That gas traps heat in the atmosphere.', 'Over time, average temperatures rise.'],
    edit: ['Rising temperatures affect the whole environment.', 'The government announced a new climate plan.'],
    design: { prompt: 'Show how CO₂ levels changed since 1950', answer: 'line' },
  },
  {
    id: 'budget', name: 'The Club Budget', emoji: '🧾',
    write: ['First, list everything the club needs to buy.', 'Next, estimate what each item will cost.', 'Finally, compare the total to the money you have.'],
    edit: ['Our business club needs a budget by Wednesday.', 'We should separate needs from wants.'],
    design: { prompt: 'Show how the club budget is split up', answer: 'pie' },
  },
  {
    id: 'pets', name: 'Cats vs. Dogs', emoji: '🐾',
    write: ['We asked 30 students which pet they prefer.', 'Dogs won by just three votes.', 'The cat people demanded a recount.'],
    edit: ['Cats and dogs are surprisingly different pets.', 'Our survey results were really close.'],
    design: { prompt: 'Show what cats and dogs have in common', answer: 'venn' },
  },
  {
    id: 'mars', name: 'Earth vs. Mars', emoji: '🪐',
    write: ['Mars is about half the size of Earth.', 'Its thin air is mostly carbon dioxide.', 'That makes it a tough place for humans to live.'],
    edit: ['Mars has a much lower temperature than Earth.', 'Scientists believe Mars once had liquid water.'],
    design: { prompt: "Show what Earth and Mars share, and what they don't", answer: 'venn' },
  },
];

// Extra, topic-free content mixed in for variety.
const GENERIC_WRITE = [
  ['First, read the assignment carefully.', 'Next, highlight what the professor is asking.', 'Only then, start writing.'],
  ['Our group met to split up the work.', 'Everyone promised to finish by Friday.', 'On Sunday night, we finally started.'],
  ['Start with a clear main argument.', 'Support it with evidence from your sources.', 'End by explaining why it matters.'],
];
const GENERIC_EDIT = [
  'I definitely started this assignment early.',
  'We will finish the slides tomorrow, probably.',
  'Nobody knows which version is the final one.',
  'Our group chat is not a reliable source.',
  'The professor said the rubric was really clear.',
  'Please remember to cite every source.',
  'Citations are necessary, even for memes.',
  'This paragraph is surprisingly good.',
];
const GENERIC_DESIGN = [
  { prompt: 'Show how your grades changed each semester', answer: 'line' },
  { prompt: 'Compare pizza orders by topping', answer: 'bar' },
  { prompt: 'Show how a day of study time is split', answer: 'pie' },
  { prompt: 'Show where club members live', answer: 'map' },
  { prompt: 'Show the steps to submit an assignment', answer: 'flow' },
  { prompt: 'Show what you and your roommate both like', answer: 'venn' },
  { prompt: 'Show sleep hours vs. exam scores', answer: 'scatter' },
  { prompt: 'Show the group project, from start to panicked finish', answer: 'timeline' },
];

export const CHARTS = {
  line: { label: 'Line chart', use: 'showing change over time' },
  bar: { label: 'Bar chart', use: 'comparing amounts' },
  pie: { label: 'Pie chart', use: 'showing parts of a whole' },
  map: { label: 'Map', use: 'showing where things are' },
  timeline: { label: 'Timeline', use: 'showing events in order' },
  flow: { label: 'Flowchart', use: 'showing the steps of a process' },
  scatter: { label: 'Scatter plot', use: 'showing how two things relate' },
  venn: { label: 'Venn diagram', use: 'showing what overlaps' },
};

const GOOD_SOURCES = [
  { text: 'Peer-reviewed journal article', icon: '📑' },
  { text: 'Government statistics report', icon: '🏛️' },
  { text: 'University research study', icon: '🎓' },
  { text: 'Encyclopedia entry with citations', icon: '📚' },
  { text: 'Your course textbook', icon: '📘' },
  { text: 'Museum archive', icon: '🏺' },
  { text: 'Interview with an expert', icon: '🎙️' },
  { text: 'Library database article', icon: '🗄️' },
  { text: 'Established newspaper investigation', icon: '📰' },
  { text: 'Original data from a research lab', icon: '🧪' },
];
const BAD_SOURCES = [
  { text: 'Anonymous blog, no sources', icon: '👤', tip: 'No author and no sources means no way to check it.' },
  { text: 'Viral video from "some guy"', icon: '📹', tip: "Going viral isn't the same as being true." },
  { text: 'Random forum reply from 2009', icon: '💬', tip: 'Old, anonymous and unchecked.' },
  { text: 'A meme your cousin shared', icon: '🐸', tip: 'Memes are fun, not facts.' },
  { text: 'Ad dressed up as an article', icon: '💸', tip: "It's selling something, so it's biased." },
  { text: '"Experts HATE this" clickbait', icon: '🎣', tip: 'Clickbait is built for clicks, not accuracy.' },
  { text: 'Satire news site', icon: '🤡', tip: "Satire is a joke. Great for laughs, useless for citations." },
  { text: 'Comment section argument', icon: '🗯️', tip: "Loud isn't the same as right." },
  { text: '"Forward to 10 friends" chain message', icon: '⛓️', tip: 'Chain messages spread rumors, not facts.' },
  { text: 'Store reviewing its own product', icon: '🛒', tip: 'A seller reviewing its own product is biased.' },
];

// Correct word -> the misspelling we hide in a sentence.
const MISSPELLINGS = {
  definitely: 'definately', necessary: 'neccessary', believe: 'beleive', environment: 'enviroment',
  government: 'goverment', separate: 'seperate', receive: 'recieve', occurred: 'occured',
  beginning: 'begining', until: 'untill', which: 'wich', their: 'thier', different: 'diffrent',
  especially: 'especialy', probably: 'probaly', really: 'realy', research: 'reserch',
  success: 'sucess', temperature: 'temprature', temperatures: 'tempratures', business: 'buisness',
  wednesday: 'wensday', knowledge: 'knowlege', achieved: 'acheived', surprisingly: 'suprisingly',
  important: 'importent', thousands: 'thousends', collected: 'colected', usually: 'usualy',
  across: 'accross', accurate: 'acurate', remember: 'remeber', tomorrow: 'tommorow',
  reliable: 'relyable', professor: 'proffesor', constantly: 'constanly', musicians: 'musicans',
};

export const EVENT_TYPES = {
  wifi: { emoji: '📶', title: 'Wi-Fi is down!' },
  deadline: { emoji: '📣', title: 'Deadline moved up!', text: 'The professor wants everything 8 seconds sooner.' },
  extension: { emoji: '🙏', title: 'Extension granted!', text: '+12 seconds on every assignment.' },
  swap: { emoji: '🔀', title: 'Roles swapped!', text: 'Everyone has a new job. Say yours out loud!' },
  groupchat: { emoji: '💬', title: 'The group chat exploded', text: 'Clear your notifications to get back to work.' },
  printer: { emoji: '🖨️', title: 'Printer jam!', text: 'Nobody can submit for 6 seconds.' },
};

export const CHAT_LINES = [
  "who's doing the slides??", 'can we meet tomorrow instead', "wait what's the topic",
  "i'll do my part later i promise", 'has anyone started', 'sorry was asleep',
  'i made a google doc!!', '👀', 'did the prof say 10 or 12 pages', 'my laptop died',
  'can someone send the rubric', "we're so cooked", 'brb getting food', 'is this due TONIGHT??',
  'who changed the font to comic sans', 'ok but what if we just... didn\'t', 'reply all: thanks!!',
];

// ---------------------------------------------------------------- helpers
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function misspell(sentence) {
  const words = sentence.split(' ');
  const candidates = [];
  words.forEach((w, i) => {
    const core = w.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (MISSPELLINGS[core]) candidates.push(i);
  });
  if (!candidates.length) return null;
  const i = pick(candidates);
  const word = words[i];
  const m = word.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!m) return null;
  let wrong = MISSPELLINGS[m[2].toLowerCase()];
  if (m[2][0] === m[2][0].toUpperCase()) wrong = wrong[0].toUpperCase() + wrong.slice(1);
  const out = words.slice();
  out[i] = m[1] + wrong + m[3];
  return { words: out, answer: i, fix: m[2] };
}

// ---------------------------------------------------------------- tasks
// A task is a tiny, 2-5 second puzzle for one step of one assignment.
// The payload includes the answer: the client checks it instantly so the game
// feels snappy, and the server only needs to hear "done".
export function makeTask(station, topic, difficulty, id) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.sophomore;
  if (station === 'research') {
    const good = shuffle(GOOD_SOURCES).slice(0, 2).map((s) => ({ ...s, good: true }));
    const bad = shuffle(BAD_SOURCES).slice(0, diff.researchOptions - 2).map((s) => ({ ...s, good: false }));
    const cards = shuffle([...good, ...bad]).map((c, i) => ({ id: i, ...c }));
    return { id, station, prompt: 'Tap the 2 sources you can actually trust', cards, need: 2 };
  }
  if (station === 'write') {
    const lines = topic && Math.random() < 0.8 ? topic.write : pick(GENERIC_WRITE);
    const strips = lines.map((text, i) => ({ id: i, text }));
    let shuffled = shuffle(strips);
    // never hand out a task that is already solved
    while (shuffled.every((s, i) => s.id === i)) shuffled = shuffle(strips);
    return { id, station, prompt: 'Tap the sentences in the order they belong', strips: shuffled, order: strips.map((s) => s.id) };
  }
  if (station === 'design') {
    const d = topic && Math.random() < 0.75 ? topic.design : pick(GENERIC_DESIGN);
    const others = shuffle(Object.keys(CHARTS).filter((k) => k !== d.answer)).slice(0, 3);
    const options = shuffle([d.answer, ...others]).map((k) => ({ id: k, label: CHARTS[k].label }));
    const tips = Object.fromEntries(Object.entries(CHARTS).map(([k, v]) => [k, `A ${v.label.toLowerCase()} is for ${v.use}.`]));
    return { id, station, prompt: d.prompt, options, answer: d.answer, tips };
  }
  // edit
  const pool = topic ? [...topic.edit, ...topic.edit, pick(GENERIC_EDIT)] : GENERIC_EDIT;
  let result = null;
  for (let tries = 0; tries < 10 && !result; tries++) result = misspell(pick(pool));
  if (!result) result = misspell(GENERIC_EDIT[0]);
  return { id, station, prompt: 'Tap the misspelled word', words: result.words, answer: result.answer, fix: result.fix };
}

// ---------------------------------------------------------------- grading
export const GRADE_POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function gradeFor(fractionLeft) {
  if (fractionLeft >= 0.5) return 'A';
  if (fractionLeft >= 0.28) return 'B';
  if (fractionLeft >= 0.12) return 'C';
  if (fractionLeft > 0) return 'D';
  return 'F';
}

export function reportFor(gpa, resolved) {
  if (!resolved) return { letter: 'I', headline: 'Incomplete', line: 'Nothing got turned in. Bold strategy.' };
  if (gpa >= 3.7) return { letter: 'A', headline: "Dean's List! 🏆", line: 'Honestly? Suspiciously well organized.' };
  if (gpa >= 3.0) return { letter: 'B', headline: 'Solid semester 👍', line: 'The group chat was actually useful for once.' };
  if (gpa >= 2.0) return { letter: 'C', headline: 'You passed… 😅', line: 'Some of you carried. You know who you are.' };
  if (gpa >= 1.0) return { letter: 'D', headline: 'See me after class 😬', line: 'Maybe start before 8 PM next time.' };
  return { letter: 'F', headline: 'Academic probation 💀', line: 'Have you tried… talking to each other?' };
}

// Superlatives for the report card. Earlier entries win ties for a player.
export const AWARDS = [
  { id: 'carry', emoji: '🏋️', title: 'Carried the Group', stat: (s) => s.steps, min: 3, blurb: (s) => `${s.steps} steps done` },
  { id: 'closer', emoji: '⬆️', title: 'The Closer', stat: (s) => s.submits, min: 2, blurb: (s) => `${s.submits} assignments submitted` },
  { id: 'router', emoji: '📨', title: 'Human Router', stat: (s) => s.passes, min: 3, blurb: (s) => `${s.passes} folders passed` },
  { id: 'clutch', emoji: '⏰', title: 'Last-Minute Legend', stat: (s) => s.clutch, min: 1, blurb: (s) => `${s.clutch} saved in the final seconds` },
  { id: 'speed', emoji: '⚡', title: 'Speed Demon', stat: (s) => (s.tasks >= 3 ? 100000 / (s.taskMs / s.tasks) : 0), min: 1, blurb: (s) => `${(s.taskMs / s.tasks / 1000).toFixed(1)}s per task` },
  { id: 'research', emoji: '🔎', title: 'Source Snob', stat: (s) => s.by.research, min: 2, blurb: (s) => `${s.by.research} research steps` },
  { id: 'edit', emoji: '🧐', title: 'Typo Hunter', stat: (s) => s.by.edit, min: 2, blurb: (s) => `${s.by.edit} typos caught` },
  { id: 'design', emoji: '🎨', title: 'Chart Wizard', stat: (s) => s.by.design, min: 2, blurb: (s) => `${s.by.design} visuals picked` },
  { id: 'write', emoji: '✍️', title: 'Wordsmith', stat: (s) => s.by.write, min: 2, blurb: (s) => `${s.by.write} paragraphs fixed` },
  { id: 'oops', emoji: '🎲', title: 'Brave Guesser', stat: (s) => s.mistakes, min: 3, blurb: (s) => `${s.mistakes} bold guesses` },
];
export const FALLBACK_AWARD = { id: 'support', emoji: '🧸', title: 'Emotional Support', blurb: () => 'Was there. Vibes were provided.' };
