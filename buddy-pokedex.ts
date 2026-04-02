#!/usr/bin/env bun
/**
 * Buddy Pokedex Generator
 *
 * Brute-force all 15-char salts to collect every unique bones combination
 * for a given userId. Outputs a complete pokedex JSON.
 *
 * Usage:
 *   bun buddy-pokedex.ts                          # use own userId, 165000 salts
 *   bun buddy-pokedex.ts --count 500000            # custom iteration count
 *   bun buddy-pokedex.ts --uid <userId>            # custom userId
 *   bun buddy-pokedex.ts --target legendary,cat    # stop when specific combo found
 */

import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// === Algorithm (identical to buddy-verify.ts) ===

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

function pick(rng: () => number, arr: readonly string[]): string {
  return arr[Math.floor(rng() * arr.length)];
}

const rarityWeights: Record<string, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"] as const;

function rollRarity(rng: () => number): string {
  let r = rng() * 100;
  for (const k of rarityOrder) { r -= rarityWeights[k]; if (r < 0) return k; }
  return "common";
}

const speciesPool = ["duck","goose","blob","cat","dragon","octopus","owl","penguin",
  "turtle","snail","ghost","axolotl","capybara","cactus","robot","rabbit","mushroom","chonk"] as const;
const eyePool = ["\u00B7","\u2726","\u00D7","\u25C9","@","\u00B0"] as const;
const hatPool = ["none","crown","tophat","propeller","halo","wizard","beanie","tinyduck"] as const;
const statNames = ["DEBUGGING","PATIENCE","CHAOS","WISDOM","SNARK"] as const;
const statBase: Record<string, number> = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

function rollStats(rng: () => number, rarity: string) {
  const base = statBase[rarity];
  const primary = pick(rng, statNames);
  let secondary = pick(rng, statNames);
  while (secondary === primary) secondary = pick(rng, statNames);
  const stats: Record<string, number> = {};
  for (const s of statNames) {
    if (s === primary) stats[s] = Math.min(100, base + 50 + Math.floor(rng() * 30));
    else if (s === secondary) stats[s] = Math.max(1, base - 10 + Math.floor(rng() * 15));
    else stats[s] = base + Math.floor(rng() * 40);
  }
  return { stats, boosted: primary, nerfed: secondary };
}

interface PokedexEntry {
  salt: string;
  rarity: string;
  species: string;
  eye: string;
  hat: string;
  shiny: boolean;
  stats: Record<string, number>;
  boosted: string;
  nerfed: string;
}

function generate(userId: string, salt: string): PokedexEntry {
  const rng = oN4(aN4(userId + salt));
  const rarity = rollRarity(rng);
  const species = pick(rng, speciesPool);
  const eye = pick(rng, eyePool);
  const hat = rarity === "common" ? "none" : pick(rng, hatPool);
  const shiny = rng() < 0.01;
  const { stats, boosted, nerfed } = rollStats(rng, rarity);
  return { salt, rarity, species, eye, hat, shiny, stats, boosted, nerfed };
}

// === Salt generator (15 chars, printable ASCII) ===

const SALT_LEN = 15;
const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-_";

function indexToSalt(i: number): string {
  let s = "";
  let n = i;
  for (let j = 0; j < SALT_LEN; j++) {
    s += CHARS[n % CHARS.length];
    n = Math.floor(n / CHARS.length);
  }
  return s;
}

// === CLI ===

function getUserId(): string {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf-8"));
    return cfg.oauthAccount?.accountUuid ?? cfg.userID ?? "anon";
  } catch { return "anon"; }
}

const args = process.argv.slice(2);
const countIdx = args.indexOf("--count");
const uidIdx = args.indexOf("--uid");
const targetIdx = args.indexOf("--target");

const COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1]) : 165_000;
const userId = uidIdx !== -1 ? args[uidIdx + 1] : getUserId();
const targetCombo = targetIdx !== -1 ? args[targetIdx + 1].split(",") : null;

console.log(`User ID: ${userId}`);
console.log(`Iterations: ${COUNT.toLocaleString()}`);
if (targetCombo) console.log(`Target: ${targetCombo.join(" + ")}`);
console.log();

const seen = new Map<string, PokedexEntry>(); // key: "rarity|species|eye|hat|shiny"
const allEntries: PokedexEntry[] = [];

const rarityCounts: Record<string, number> = {};
let shinies = 0;
let targetHit: PokedexEntry | null = null;

const t0 = performance.now();

for (let i = 0; i < COUNT; i++) {
  const salt = indexToSalt(i);
  const entry = generate(userId, salt);

  const key = `${entry.rarity}|${entry.species}|${entry.eye}|${entry.hat}|${entry.shiny}`;
  if (!seen.has(key)) {
    seen.set(key, entry);
  }

  rarityCounts[entry.rarity] = (rarityCounts[entry.rarity] || 0) + 1;
  if (entry.shiny) shinies++;

  if (targetCombo && !targetHit) {
    const match = targetCombo.every(t =>
      t === entry.rarity || t === entry.species || t === entry.eye ||
      t === entry.hat || (t === "shiny" && entry.shiny)
    );
    if (match) {
      targetHit = entry;
      console.log(`TARGET FOUND at iteration ${i}: salt="${entry.salt}"`);
      console.log(`  ${entry.rarity} ${entry.species} eye=${entry.eye} hat=${entry.hat} shiny=${entry.shiny}`);
      console.log();
    }
  }

  // Progress
  if ((i + 1) % 50_000 === 0) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`  ${(i + 1).toLocaleString()} / ${COUNT.toLocaleString()} (${elapsed}s, ${seen.size} unique)\r`);
  }
}

const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
console.log();
console.log(`Done in ${elapsed}s`);
console.log();

// === Output ===

// Sort by rarity tier, then species
const tierOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
const sorted = [...seen.values()].sort((a, b) =>
  (tierOrder[a.rarity] ?? 9) - (tierOrder[b.rarity] ?? 9) || a.species.localeCompare(b.species)
);

// Summary
console.log("=== Rarity Distribution ===");
for (const r of rarityOrder) {
  const c = rarityCounts[r] || 0;
  const pct = ((c / COUNT) * 100).toFixed(1);
  console.log(`  ${r.padEnd(12)} ${c.toLocaleString().padStart(8)} (${pct}%)`);
}
console.log(`  ${"shiny".padEnd(12)} ${shinies.toLocaleString().padStart(8)} (${((shinies / COUNT) * 100).toFixed(2)}%)`);
console.log();

console.log("=== Unique Combos ===");
console.log(`  Total: ${seen.size}`);
const speciesSet = new Set(sorted.map(e => e.species));
const eyeSet = new Set(sorted.map(e => e.eye));
const hatSet = new Set(sorted.map(e => e.hat));
console.log(`  Species: ${speciesSet.size}/${speciesPool.length}`);
console.log(`  Eyes: ${eyeSet.size}/${eyePool.length}`);
console.log(`  Hats: ${hatSet.size}/${hatPool.length}`);
console.log();

// Legendary table
console.log("=== Legendary Entries ===");
const legendaries = sorted.filter(e => e.rarity === "legendary");
for (const e of legendaries) {
  const sh = e.shiny ? " SHINY" : "";
  const st = statNames.map(s => `${s.slice(0,3)}=${String(e.stats[s]).padStart(3)}`).join(" ");
  console.log(`  ${e.species.padEnd(10)} ${e.eye} ${e.hat.padEnd(10)} ${st}${sh}  salt=${e.salt}`);
}
console.log();

// Write full pokedex
const outFile = `buddy-pokedex-${userId.slice(0, 8)}.json`;
writeFileSync(outFile, JSON.stringify({
  userId,
  generatedAt: new Date().toISOString(),
  iterations: COUNT,
  uniqueCombos: seen.size,
  rarityCounts,
  shinies,
  entries: sorted,
}, null, 2));

console.log(`Full pokedex: ${outFile} (${sorted.length} entries)`);
