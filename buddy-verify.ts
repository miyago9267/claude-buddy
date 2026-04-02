#!/usr/bin/env bun
/**
 * Buddy Verification Simulator & Bones Collector
 *
 * Replicates the EXACT generation algorithm with Bun.hash() to verify
 * what bones will be produced before actually running /buddy.
 *
 * Usage:
 *   bun buddy-verify.ts [salt]                  -- visual display
 *   bun buddy-verify.ts --json [salt]            -- JSON output (single)
 *   bun buddy-verify.ts --bulk <file>            -- bulk generate from userId list
 *   bun buddy-verify.ts --bulk <file> [salt]     -- bulk with custom salt
 *
 * Bulk file format: one userId per line (or JSON array of strings)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

// === Exact algorithm from Claude Code v2.1.90 (verified identical to v2.1.89) ===

function aN4(str: string): number {
  return Number(BigInt(Bun.hash(str)) & 0xFFFFFFFFn);
}

function oN4(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function DZH(rng: () => number, arr: readonly string[]): string {
  return arr[Math.floor(rng() * arr.length)];
}

const LN6: Record<string, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const Orq = ["common", "uncommon", "rare", "epic", "legendary"] as const;

function sN4(rng: () => number): string {
  const total = Object.values(LN6).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const k of Orq) { r -= LN6[k]; if (r < 0) return k; }
  return "common";
}

const speciesPool = ["duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot", "rabbit",
  "mushroom", "chonk"] as const;
const eyePool = ["\u00B7", "\u2726", "\u00D7", "\u25C9", "@", "\u00B0"] as const;
const hatPool = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"] as const;
const statNames = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const;
const tN4: Record<string, number> = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

function eN4(rng: () => number, rarity: string) {
  const base = tN4[rarity];
  const primary = DZH(rng, statNames);
  let secondary = DZH(rng, statNames);
  while (secondary === primary) secondary = DZH(rng, statNames);
  const result: Record<string, number> = {};
  for (const s of statNames) {
    if (s === primary) result[s] = Math.min(100, base + 50 + Math.floor(rng() * 30));
    else if (s === secondary) result[s] = Math.max(1, base - 10 + Math.floor(rng() * 15));
    else result[s] = base + Math.floor(rng() * 40);
  }
  return { stats: result, boosted: [primary], nerfed: [secondary] };
}

const wordPool = ["thunder","biscuit","void","accordion","moss","velvet","rust","pickle","crumb","whisper","gravy","frost","ember","soup","marble","thorn","honey","static","copper","dusk","sprocket","bramble","cinder","wobble","drizzle","flint","tinsel","murmur","clatter","gloom","nectar","quartz","shingle","tremor","umber","waffle","zephyr","bristle","dapple","fennel","gristle","huddle","kettle","lumen","mottle","nuzzle","pebble","quiver","ripple","sable","thistle","vellum","wicker","yonder","bauble","cobble","doily","fickle","gambit","hubris","jostle","knoll","larder","mantle","nimbus","oracle","plinth","quorum","relic","spindle","trellis","urchin","vortex","warble","xenon","yoke","zenith","alcove","brogue","chisel","dirge","epoch","fathom","glint","hearth","inkwell","jetsam","kiln","lattice","mirth","nook","obelisk","parsnip","quill","rune","sconce","tallow","umbra","verve","wisp","yawn","apex","brine","crag","dregs","etch","flume","gable","husk","ingot","jamb","knurl","loam","mote","nacre","ogle","prong","quip","rind","slat","tuft","vane","welt","yarn","bane","clove","dross","eave","fern","grit","hive","jade","keel","lilt","muse","nape","omen","pith","rook","silt","tome","urge","vex","wane","yew","zest"];
const fallbackNames = ["Crumpet", "Soup", "Pickle", "Biscuit", "Moth", "Gravy"];

function m35(seed: number, count: number): string[] {
  let q = seed >>> 0;
  const set = new Set<number>();
  while (set.size < count) {
    q = Math.imul(q, 1664525) + 1013904223 >>> 0;
    set.add(q % wordPool.length);
  }
  return [...set].map(i => wordPool[i]);
}

// === Core: generate bones for a userId + salt ===

interface Bones {
  userId: string;
  salt: string;
  hash: number;
  rarity: string;
  species: string;
  eye: string;
  hat: string;
  shiny: boolean;
  stats: Record<string, number>;
  boosted: string[];
  nerfed: string[];
  inspirationSeed: number;
  words: string[];
  fallbackName: string;
}

function generateBones(userId: string, salt: string): Bones {
  const input = userId + salt;
  const seed = aN4(input);
  const rng = oN4(seed);

  const rarity = sN4(rng);
  const sp = DZH(rng, speciesPool);
  const eye = DZH(rng, eyePool);
  const hat = rarity === "common" ? "none" : DZH(rng, hatPool);
  const shiny = rng() < 0.01;
  const { stats, boosted, nerfed } = eN4(rng, rarity);
  const inspirationSeed = Math.floor(rng() * 1e9);
  const words = m35(inspirationSeed, 4);
  const fallbackIdx = sp.charCodeAt(0) + eye.charCodeAt(0);
  const fallbackName = fallbackNames[fallbackIdx % fallbackNames.length];

  return { userId, salt, hash: seed, rarity, species: sp, eye, hat, shiny, stats, boosted, nerfed, inspirationSeed, words, fallbackName };
}

// === Read user ID from config ===
function getUserId(): string {
  try {
    const configPath = join(homedir(), ".claude.json");
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    return cfg.oauthAccount?.accountUuid ?? cfg.userID ?? "anon";
  } catch {
    return "anon";
  }
}

// === Detect salt from binary ===
function detectSalt(): string {
  try {
    const dir = join(homedir(), ".local/share/claude/versions");
    const latest = execSync(`ls -t "${dir}" | head -1`, { encoding: "utf-8" }).trim();
    const binary = join(dir, latest);
    const buf = readFileSync(binary);
    const idx = buf.indexOf("friend-2026-401");
    if (idx !== -1) return "friend-2026-401";
    return "friend-2026-401";
  } catch {
    return "friend-2026-401";
  }
}

// === Display helpers ===

const speciesArt: Record<string, string[]> = {
  duck:     ["    __      ","  <({E} )___  ","   (  ._>   ","    `--'    "],
  goose:    ["     ({E}>    ","     ||     ","   _(__)_   ","    ^^^^    "],
  blob:     ["   .----.   ","  ( {E}  {E} )  ","  (      )  ","   `----'   "],
  cat:      ["   /\\_/\\    ","  ( {E}   {E})  ","  (  \u03C9  )   ",'  (")"(")\  '],
  dragon:   ["  /^\\  /^\\  "," <  {E}  {E}  > "," (   ~~   ) ","  `-vvvv-'  "],
  octopus:  ["   .----.   ","  ( {E}  {E} )  ","  (______)  ","  /\\/\\/\\/\\  "],
  owl:      ["   /\\  /\\   ","  (({E})({E}))  ","  (  ><  )  ","   `----'   "],
  penguin:  ["  .---.     ","  ({E}>{E})     "," /(   )\\    ","  `---'     "],
  turtle:   ["   _,--._   ","  ( {E}  {E} )  "," /[______]\\ ","  ``    ``  "],
  snail:    [" {E}    .--.  ","  \\  ( @ )  ","   \\_`--'   ","  ~~~~~~~   "],
  ghost:    ["   .----.   ","  / {E}  {E} \\  ","  |      |  ","  ~`~``~`~  "],
  axolotl:  ["}~(______)~{","}~({E} .. {E})~{","  ( .--. )  ","  (_/  \\_)  "],
  capybara: ["  n______n  "," ( {E}    {E} ) "," (   oo   ) ","  `------'  "],
  cactus:   [" n  ____  n "," | |{E}  {E}| | "," |_|    |_| ","   |    |   "],
  robot:    ["   .[||].   ","  [ {E}  {E} ]  ","  [ ==== ]  ","  `------'  "],
  rabbit:   ["   (\\__/)   ","  ( {E}  {E} )  "," =(  ..  )= ",'  (")"(")\  '],
  mushroom: [" .-o-OO-o-. ","(__________)","   |{E}  {E}|   ","   |____|   "],
  chonk:    ["  /\\    /\\  "," ( {E}    {E} ) "," (   ..   ) ","  `------'  "],
};

const hatArt: Record<string, string> = {
  none: "", crown: "   \\^^^/    ", tophat: "   [___]    ",
  propeller: "    -+-     ", halo: "   (   )    ", wizard: "    /^\\     ",
  beanie: "   (___)    ", tinyduck: "    ,>      "
};

const rarityColors: Record<string, string> = {
  common: "\x1b[90m", uncommon: "\x1b[32m", rare: "\x1b[35m",
  epic: "\x1b[36m", legendary: "\x1b[33m"
};
const rarityStars: Record<string, string> = {
  common: "\u2605", uncommon: "\u2605\u2605", rare: "\u2605\u2605\u2605", epic: "\u2605\u2605\u2605\u2605", legendary: "\u2605\u2605\u2605\u2605\u2605"
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function displayBones(b: Bones) {
  const color = rarityColors[b.rarity] || "";
  const stars = rarityStars[b.rarity] || "";

  console.log();
  console.log(`${BOLD}=== Buddy Verification ===${RESET}`);
  console.log();
  console.log(`${DIM}User ID:  ${b.userId}${RESET}`);
  console.log(`${DIM}Salt:     ${b.salt}${RESET}`);
  console.log(`${DIM}Hash:     ${b.hash} (0x${b.hash.toString(16)})${RESET}`);
  console.log();

  const art = speciesArt[b.species] || ["???"];
  const hatLine = b.hat !== "none" ? hatArt[b.hat] : "";
  if (hatLine) console.log(`${color}${hatLine}${RESET}`);
  for (const line of art) {
    console.log(`${color}${line.replace(/\{E\}/g, b.eye)}${RESET}`);
  }
  console.log();
  console.log(`${color}${stars} ${b.rarity.toUpperCase()}${RESET}  ${color}${b.species.toUpperCase()}${RESET}`);
  if (b.shiny) console.log(`\x1b[33m${BOLD}\u2728 SHINY \u2728${RESET}`);
  console.log();
  console.log(`${BOLD}Fallback name:${RESET} ${b.fallbackName}`);
  console.log(`${DIM}(API will generate a unique name + personality at hatch time)${RESET}`);
  console.log();

  console.log(`${BOLD}Stats:${RESET}`);
  for (const s of statNames) {
    const val = b.stats[s];
    const bar = "\u2588".repeat(Math.round(val / 10)) + "\u2591".repeat(10 - Math.round(val / 10));
    const isBoosted = b.boosted.includes(s);
    const isNerfed = b.nerfed.includes(s);
    const statColor = isBoosted ? "\x1b[33m" : isNerfed ? "\x1b[31m" : "";
    const tag = isBoosted ? " \u2191" : isNerfed ? " \u2193" : "";
    console.log(`  ${statColor}${s.padEnd(10)} ${bar} ${String(val).padStart(3)}${tag}${RESET}`);
  }

  console.log();
  console.log(`${BOLD}Eye:${RESET} ${b.eye}  ${BOLD}Hat:${RESET} ${b.hat}  ${BOLD}Shiny:${RESET} ${b.shiny}`);
  console.log(`${BOLD}Inspiration:${RESET} ${b.words.join(", ")}`);
  console.log();
}

// === CLI ===

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const bulkIdx = args.indexOf("--bulk");

if (bulkIdx !== -1) {
  // --bulk <file> [salt]
  const file = args[bulkIdx + 1];
  if (!file || !existsSync(file)) {
    console.error("Usage: bun buddy-verify.ts --bulk <userids-file> [salt]");
    process.exit(1);
  }
  const salt = args[bulkIdx + 2] || "friend-2026-401";
  const raw = readFileSync(file, "utf-8").trim();
  const userIds: string[] = raw.startsWith("[") ? JSON.parse(raw) : raw.split("\n").map(l => l.trim()).filter(Boolean);

  const results = userIds.map(uid => generateBones(uid, salt));
  const outFile = file.replace(/\.[^.]+$/, "") + "-bones.json";
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Generated ${results.length} bones -> ${outFile}`);

  // Summary table
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[r.rarity] = (counts[r.rarity] || 0) + 1;
  }
  console.log("\nRarity distribution:");
  for (const k of Orq) console.log(`  ${k}: ${counts[k] || 0}`);
  const shinyCount = results.filter(r => r.shiny).length;
  if (shinyCount) console.log(`  shiny: ${shinyCount}`);

} else {
  // Single mode
  const filteredArgs = args.filter(a => a !== "--json");
  const salt = filteredArgs[0] || detectSalt();
  const userId = getUserId();
  const bones = generateBones(userId, salt);

  if (jsonMode) {
    console.log(JSON.stringify(bones, null, 2));
  } else {
    displayBones(bones);
    if (salt !== "friend-2026-401") {
      const orig = generateBones(userId, "friend-2026-401");
      console.log(`${DIM}--- vs Original (friend-2026-401) ---${RESET}`);
      console.log(`${DIM}Original: ${orig.rarity} ${orig.species}${RESET}`);
      console.log(`${DIM}Patched:  ${bones.rarity} ${bones.species}${bones.shiny ? " SHINY" : ""}${RESET}`);
      console.log();
    }
  }
}
