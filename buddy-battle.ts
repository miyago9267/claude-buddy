#!/usr/bin/env bun
/**
 * Buddy Battle -- Roguelike CLI pet battle (v2)
 * Poll-mode terminal UI with ASCII sprites
 * Usage: bun buddy-battle.ts
 */

// ─── PRNG (from buddy system) ───

function hash(str: string): number {
  return Number(BigInt(Bun.hash(str)) & 0xffffffffn)
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 1831565813) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

// ─── Constants ───

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const
type Rarity = (typeof RARITIES)[number]

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
] as const
type Species = (typeof SPECIES)[number]

const EYES = ["\u00b7", "\u2726", "\u00d7", "\u25c9", "@", "\u00b0"] as const
const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"] as const
const STATS = ["CHAOS", "PATIENCE", "WISDOM", "SNARK", "DEBUGGING"] as const
type Stat = (typeof STATS)[number]
const STAT_BASE: Record<Rarity, number> = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }

// ─── Type System (chaos > wild > order > chaos) ───

type BuddyType = "chaos" | "order" | "wild"

const SPECIES_TYPE: Record<Species, BuddyType> = {
  dragon: "chaos", ghost: "chaos", blob: "chaos", chonk: "chaos", cat: "chaos",
  robot: "order", owl: "order", penguin: "order", turtle: "order", snail: "order",
  duck: "wild", goose: "wild", octopus: "wild", axolotl: "wild",
  capybara: "wild", cactus: "wild", mushroom: "wild", rabbit: "wild",
}

const TYPE_LABEL: Record<BuddyType, string> = { chaos: "混沌", order: "秩序", wild: "野性" }
const TYPE_ADV: Record<BuddyType, BuddyType> = { chaos: "wild", wild: "order", order: "chaos" }

function typeEff(atk: BuddyType | "neutral", def: BuddyType): number {
  if (atk === "neutral") return 1
  if (TYPE_ADV[atk] === def) return 1.5
  if (TYPE_ADV[def] === atk) return 0.7
  return 1
}

// ─── Moves ───

interface Move {
  name: string
  type: BuddyType | "neutral"
  power: number
  accuracy: number
  effect?: { kind: "heal" | "buff" | "debuff"; stat?: Stat; amount: number }
}

const MOVES: Record<BuddyType | "neutral", Move[]> = {
  chaos: [
    { name: "Havoc Blast", type: "chaos", power: 80, accuracy: 85 },
    { name: "Dark Pulse", type: "chaos", power: 60, accuracy: 95 },
    { name: "Inferno", type: "chaos", power: 100, accuracy: 70 },
    { name: "Shadow Claw", type: "chaos", power: 55, accuracy: 100 },
  ],
  order: [
    { name: "Precision Strike", type: "order", power: 70, accuracy: 100 },
    { name: "Logic Bomb", type: "order", power: 85, accuracy: 80 },
    { name: "Firewall", type: "order", power: 50, accuracy: 100, effect: { kind: "buff", stat: "PATIENCE", amount: 10 } },
    { name: "System Scan", type: "order", power: 45, accuracy: 100, effect: { kind: "buff", stat: "DEBUGGING", amount: 15 } },
  ],
  wild: [
    { name: "Vine Whip", type: "wild", power: 65, accuracy: 95 },
    { name: "Spore Cloud", type: "wild", power: 45, accuracy: 90, effect: { kind: "debuff", stat: "DEBUGGING", amount: 10 } },
    { name: "Nature's Wrath", type: "wild", power: 90, accuracy: 75 },
    { name: "Petal Storm", type: "wild", power: 55, accuracy: 100 },
  ],
  neutral: [
    { name: "Tackle", type: "neutral", power: 40, accuracy: 100 },
    { name: "Rest", type: "neutral", power: 0, accuracy: 100, effect: { kind: "heal", amount: 0 } },
  ],
}

// ─── Pet ───

interface PetStats { CHAOS: number; PATIENCE: number; WISDOM: number; SNARK: number; DEBUGGING: number }

interface Pet {
  species: Species
  rarity: Rarity
  eye: string
  hat: string
  shiny: boolean
  type: BuddyType
  stats: PetStats
  moves: Move[]
  hp: number
  maxHp: number
}

function rollRarity(rng: () => number): Rarity {
  let r = rng() * 100
  for (const k of RARITIES) { r -= RARITY_WEIGHTS[k]; if (r < 0) return k }
  return "common"
}

function generatePet(): Pet {
  const salt = Math.random().toString(36).slice(2, 17)
  const rng = splitmix32(hash("buddy-battle" + salt))
  const rarity = rollRarity(rng)
  const species = pick(rng, SPECIES)
  const eye = pick(rng, EYES)
  const hat = rarity === "common" ? "none" : pick(rng, HATS)
  const shiny = rng() < 0.01
  const base = STAT_BASE[rarity]
  const primary = pick(rng, STATS)
  let secondary = pick(rng, STATS)
  while (secondary === primary) secondary = pick(rng, STATS)
  const stats = {} as PetStats
  for (const s of STATS) {
    if (s === primary) stats[s] = Math.min(100, base + 50 + Math.floor(rng() * 30))
    else if (s === secondary) stats[s] = Math.max(1, base - 10 + Math.floor(rng() * 15))
    else stats[s] = base + Math.floor(rng() * 40)
  }
  if (shiny) for (const s of STATS) stats[s] = Math.min(100, stats[s] + 10)
  const type = SPECIES_TYPE[species]
  const maxHp = stats.PATIENCE * 2 + 50
  const own = [...MOVES[type]].sort(() => Math.random() - 0.5)
  const covType = (["chaos", "order", "wild"] as BuddyType[]).filter(t => t !== type)[Math.floor(Math.random() * 2)]
  const moves: Move[] = [
    own[0], own[1],
    MOVES[covType][Math.floor(Math.random() * MOVES[covType].length)],
    stats.WISDOM > 40 ? MOVES.neutral[1] : MOVES.neutral[0],
  ]
  return { species, rarity, eye, hat, shiny, type, stats, moves, hp: maxHp, maxHp }
}

function generateEnemy(floor: number): Pet {
  const isBoss = floor === 5 || floor === 10
  const minRarityIdx = isBoss ? (floor === 10 ? 3 : 2) : 0
  let pet: Pet, attempts = 0
  do { pet = generatePet(); attempts++ } while (RARITIES.indexOf(pet.rarity) < minRarityIdx && attempts < 200)
  const scale = isBoss ? (floor === 10 ? 1.5 : 1.2) : 0.8 + floor * 0.06
  for (const s of STATS) pet.stats[s] = Math.min(100, Math.floor(pet.stats[s] * scale))
  pet.maxHp = pet.stats.PATIENCE * 2 + 50
  pet.hp = pet.maxHp
  return pet
}

// ─── Sprites ───

function getSprite(sp: Species, e: string): string[] {
  switch (sp) {
    case "duck":     return [`   __    `, ` >(${e}')>  `, `  //     `, ` (_)     `]
    case "goose":    return [`   ___   `, `>(${e}'')>  `, `  /|\\   `, ` (_)_)   `]
    case "blob":     return [` .-==-.  `, `( ${e}  ${e} ) `, ` \\_\\_/  `, `  ~~~~   `]
    case "cat":      return [` /\\_/\\  `, `( ${e}.${e} ) `, ` =>.<= `, `  /|\\   `]
    case "dragon":   return [` ^/\\_/\\^`, `( ${e}  ${e} ) `, ` >\\/\\/<`, ` _/  \\_ `]
    case "octopus":  return [`  .==.   `, ` (${e}  ${e})  `, `  \\__/  `, ` /|/|/| `]
    case "owl":      return [` .({${e}.${e}}).`, `( \\--/ )`, `  -  -  `, `  //\\\\  `]
    case "penguin":  return [`   __    `, `  (${e}${e})   `, ` /|  |\\  `, `  \\__/  `]
    case "turtle":   return [`  .==.   `, ` /|${e}${e}|\\ `, ` |____|  `, `  d  b  `]
    case "snail":    return [`    @    `, `  _(${e}${e})  `, ` |____|  `, `     /   `]
    case "ghost":    return [`  .--.   `, ` ( ${e}${e} )  `, ` |    |  `, `  \\/\\/  `]
    case "axolotl":  return [`\\(${e}.${e})/  `, `  |  |   `, ` /\\/\\/\\`, `(_)  (_) `]
    case "capybara": return [`  .__.   `, ` ( ${e}${e} )  `, `  (w )   `, `  |__|   `]
    case "cactus":   return [`   |     `, `  (${e})    `, ` _| |_   `, ` |___|   `]
    case "robot":    return [` [====]  `, ` | ${e}${e} |  `, ` |____|  `, `  /  \\  `]
    case "rabbit":   return [`  () ()  `, ` ( ${e}.${e} ) `, `  (  )   `, `  || ||  `]
    case "mushroom": return [`  .--.   `, ` / ${e}${e} \\  `, ` '-..-'  `, `   ||    `]
    case "chonk":    return [` .----.  `, `/ ${e}  ${e} \\ `, `| ~~~~ | `, ` '----'  `]
  }
}

function getHat(hat: string): string {
  switch (hat) {
    case "crown":     return `  \\V/   `
    case "tophat":    return `  n=n   `
    case "propeller": return `  _|_   `
    case "halo":      return `  -o-   `
    case "wizard":    return `  /^\\   `
    case "beanie":    return `  ===   `
    case "tinyduck":  return `  >~    `
    default: return ""
  }
}

function petSprite(p: Pet): string[] {
  const body = getSprite(p.species, p.eye)
  const hat = getHat(p.hat)
  return hat ? [hat, ...body] : body
}

function face(sp: Species, e: string): string {
  const f: Record<Species, string> = {
    duck: `>(${e}')>`, goose: `>(${e}'')>`, blob: `(${e}~${e})`, cat: `/${e}.${e}\\`,
    dragon: `{${e}^${e}}`, octopus: `(${e}v${e})`, owl: `({${e}.${e}})`, penguin: `(${e}v${e})`,
    turtle: `|${e}_${e}|`, snail: `@(${e}${e})`, ghost: `(${e}o${e})`, axolotl: `~${e}.${e}~`,
    capybara: `(${e}w${e})`, cactus: `(${e})`, robot: `[${e}_${e}]`, rabbit: `(${e}.${e})`,
    mushroom: `o(${e}${e})`, chonk: `((${e}${e}))`,
  }
  return f[sp]
}

// ─── Animation ───

const ANIM_H = 7

function animSprite(base: string[], eye: string, frame: number): string[] {
  const f = frame % 8
  const w = Math.max(...base.map(l => l.length))
  const blank = " ".repeat(w)
  let lines = [...base]
  // Blink on frames 5-6
  if (f === 5 || f === 6) {
    lines = lines.map(l => { let r = ""; for (const c of l) r += c === eye ? "-" : c; return r })
  }
  // Pad to ANIM_H with bounce offset (0=rest, 1-2=up, 7=down)
  const topPad = (f === 1 || f === 2) ? 0 : f === 7 ? 2 : 1
  const bottom = Math.max(0, ANIM_H - lines.length - topPad)
  return [...Array(Math.max(0, topPad)).fill(blank), ...lines, ...Array(bottom).fill(blank)]
}

interface AtkState { moveType: BuddyType | "neutral"; isPlayerAtk: boolean; frame: number }

// ─── Screen + Input (poll mode) ───

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m",
}
const RARITY_CLR: Record<Rarity, string> = {
  common: C.white, uncommon: C.green, rare: C.cyan, epic: C.magenta, legendary: C.yellow,
}
const TYPE_CLR: Record<BuddyType, string> = { chaos: C.red, order: C.blue, wild: C.green }

let scr: string[] = []
const cls = () => { scr = [] }
const ln = (s = "") => scr.push(s)
const render = () => {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l")
  process.stdout.write(scr.join("\n") + "\n")
}
const cleanup = () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.stdout.write("\x1b[?25h\x1b[0m\n")
}

function stripAnsi(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, "") }
function vw(s: string): number { return stripAnsi(s).length }
function padR(s: string, w: number): string { return s + " ".repeat(Math.max(0, w - vw(s))) }

function parseKey(data: string): string {
  if (data === "\x1b[A") return "up"
  if (data === "\x1b[B") return "down"
  if (data === "\x1b[C") return "right"
  if (data === "\x1b[D") return "left"
  if (data === "\r" || data === "\n") return "enter"
  if (data === " ") return "space"
  if (data === "\x03") return "quit"
  return data
}

function initStdin() {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")
}

async function anyKey(): Promise<void> {
  return new Promise(resolve => {
    initStdin()
    const handler = (data: string) => {
      if (parseKey(data) === "quit") { cleanup(); process.exit(0) }
      process.stdin.removeListener("data", handler)
      resolve()
    }
    process.stdin.on("data", handler)
  })
}

async function anyKeyAnim(buildFn: (frame: number) => void, interval = 400): Promise<void> {
  return new Promise(resolve => {
    initStdin()
    let frame = 0
    buildFn(frame); render()
    const timer = setInterval(() => { frame++; buildFn(frame); render() }, interval)
    const handler = (data: string) => {
      if (parseKey(data) === "quit") { clearInterval(timer); cleanup(); process.exit(0) }
      clearInterval(timer)
      process.stdin.removeListener("data", handler)
      resolve()
    }
    process.stdin.on("data", handler)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function waitOrKey(ms: number): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume()
    const timer = setTimeout(done, ms)
    function done() { clearTimeout(timer); process.stdin.removeListener("data", handler); resolve() }
    function handler() { done() }
    process.stdin.on("data", handler)
  })
}

async function selectOneAnim(count: number, buildFn: (cursor: number, frame: number) => void, interval = 400): Promise<number> {
  return new Promise(resolve => {
    initStdin()
    let cur = 0, frame = 0
    buildFn(cur, frame); render()
    const timer = setInterval(() => { frame++; buildFn(cur, frame); render() }, interval)
    function done(i: number) { clearInterval(timer); process.stdin.removeListener("data", handler); resolve(i) }
    function handler(data: string) {
      const k = parseKey(data)
      if (k === "quit") { clearInterval(timer); cleanup(); process.exit(0) }
      if (k === "up" || k === "left") { cur = (cur - 1 + count) % count; buildFn(cur, frame); render() }
      else if (k === "down" || k === "right") { cur = (cur + 1) % count; buildFn(cur, frame); render() }
      else if (k === "enter" || k === "space") done(cur)
      else { const n = parseInt(k); if (n >= 1 && n <= count) done(n - 1) }
    }
    process.stdin.on("data", handler)
  })
}

async function selectOne(count: number, buildFn: (cursor: number) => void): Promise<number> {
  return new Promise(resolve => {
    initStdin()
    let cur = 0
    buildFn(cur); render()
    function done(i: number) { process.stdin.removeListener("data", handler); resolve(i) }
    function handler(data: string) {
      const k = parseKey(data)
      if (k === "quit") { cleanup(); process.exit(0) }
      if (k === "up" || k === "left") cur = (cur - 1 + count) % count
      else if (k === "down" || k === "right") cur = (cur + 1) % count
      else if (k === "enter" || k === "space") { done(cur); return }
      else { const n = parseInt(k); if (n >= 1 && n <= count) { done(n - 1); return } }
      buildFn(cur); render()
    }
    process.stdin.on("data", handler)
  })
}

async function selectMulti(count: number, target: number, buildFn: (cursor: number, selected: Set<number>) => void): Promise<number[]> {
  return new Promise(resolve => {
    initStdin()
    let cur = 0
    const sel = new Set<number>()
    buildFn(cur, sel); render()
    function toggle(i: number) { if (sel.has(i)) sel.delete(i); else if (sel.size < target) sel.add(i) }
    function handler(data: string) {
      const k = parseKey(data)
      if (k === "quit") { cleanup(); process.exit(0) }
      if (k === "up" || k === "left") cur = (cur - 1 + count) % count
      else if (k === "down" || k === "right") cur = (cur + 1) % count
      else if (k === "space") toggle(cur)
      else if (k === "enter" && sel.size === target) { process.stdin.removeListener("data", handler); resolve([...sel].sort()); return }
      else { const n = parseInt(k) - 1; if (n >= 0 && n < count) toggle(n) }
      buildFn(cur, sel); render()
    }
    process.stdin.on("data", handler)
  })
}

function atkGap(s: AtkState): string[] {
  const ch: Record<string, string> = { chaos: "*", order: "#", wild: "~", neutral: "." }
  const sym = ch[s.moveType] || "."
  const clr = s.moveType === "neutral" ? C.white : TYPE_CLR[s.moveType as BuddyType]
  let g: string
  if (s.frame === 0) g = s.isPlayerAtk ? `  ${clr}>>${C.reset}  ` : `  ${clr}<<${C.reset}  `
  else if (s.frame === 1) g = s.isPlayerAtk ? ` ${clr}>>>>${C.reset} ` : ` ${clr}<<<<${C.reset} `
  else g = ` ${clr}${sym}${sym}${sym}${sym}${C.reset} `
  return Array(ANIM_H).fill(g)
}

// ─── Display helpers ───

function div(title: string, w = 50): string {
  const pad = Math.max(1, Math.floor((w - title.length - 2) / 2))
  return `${"─".repeat(pad)} ${title} ${"─".repeat(Math.max(1, w - pad - title.length - 2))}`
}

function hpBar(hp: number, max: number, w = 16): string {
  const ratio = Math.max(0, hp) / max
  const filled = Math.round(ratio * w)
  const c = ratio > 0.5 ? C.green : ratio > 0.25 ? C.yellow : C.red
  return `${c}${"█".repeat(filled)}${C.dim}${"░".repeat(w - filled)}${C.reset} ${Math.max(0, hp)}/${max}`
}

function rarityTag(r: Rarity): string { return `${RARITY_CLR[r]}${r}${C.reset}` }
function typeTag(t: BuddyType): string { return `${TYPE_CLR[t]}${TYPE_LABEL[t]}${C.reset}` }

function petInfoShort(p: Pet): string {
  const sh = p.shiny ? ` ${C.yellow}*SHINY*${C.reset}` : ""
  const h = p.hat !== "none" ? ` ${p.hat}` : ""
  return `[${rarityTag(p.rarity)}] ${p.species} ${p.eye}${h}${sh} <${typeTag(p.type)}>`
}

function statLine(p: Pet): string {
  const s = p.stats
  return `${C.dim}C:${C.reset}${s.CHAOS} ${C.dim}P:${C.reset}${s.PATIENCE} ${C.dim}W:${C.reset}${s.WISDOM} ${C.dim}S:${C.reset}${s.SNARK} ${C.dim}D:${C.reset}${s.DEBUGGING}`
}

function colorSprite(lines: string[], p: Pet): string[] {
  const c = p.shiny ? C.yellow : TYPE_CLR[p.type]
  return lines.map(l => `${c}${l}${C.reset}`)
}

function sideBySide(left: string[], right: string[], gap = 6, gapLines?: string[]): string[] {
  const maxH = Math.max(left.length, right.length)
  const leftW = Math.max(...left.map(l => vw(l)))
  const result: string[] = []
  for (let i = 0; i < maxH; i++) {
    const l = padR(left[i] || "", leftW)
    const r = right[i] || ""
    const g = gapLines?.[i] ?? " ".repeat(gap)
    result.push("    " + l + g + r)
  }
  return result
}

// ─── Battle Engine ───

function calcDamage(atk: Pet, def: Pet, move: Move) {
  if (Math.random() * 100 > move.accuracy) return { dmg: 0, crit: false, miss: true, eff: 1 }
  if (Math.random() < def.stats.SNARK / 300) return { dmg: 0, crit: false, miss: true, eff: 1 }
  const eff = typeEff(move.type as BuddyType, def.type)
  const base = (atk.stats.CHAOS / 50) * move.power
  const crit = Math.random() < atk.stats.DEBUGGING / 200
  const variance = 0.85 + Math.random() * 0.3
  const defense = def.stats.PATIENCE / 5
  const dmg = Math.max(1, Math.floor(base * eff * (crit ? 1.5 : 1) * variance - defense))
  return { dmg, crit, miss: false, eff }
}

function applyEffect(move: Move, user: Pet, target: Pet): string {
  const e = move.effect
  if (!e) return ""
  if (e.kind === "heal") {
    const heal = Math.floor(user.maxHp * (user.stats.WISDOM / 200 + 0.15))
    user.hp = Math.min(user.maxHp, user.hp + heal)
    return `回復 ${heal} HP`
  }
  if (e.kind === "buff" && e.stat) {
    user.stats[e.stat] = Math.min(100, user.stats[e.stat] + e.amount)
    return `${e.stat} +${e.amount}`
  }
  if (e.kind === "debuff" && e.stat) {
    target.stats[e.stat] = Math.max(1, target.stats[e.stat] - e.amount)
    return `${target.species} ${e.stat} -${e.amount}`
  }
  return ""
}

function enemyAI(enemy: Pet, player: Pet): Move {
  if (enemy.hp < enemy.maxHp * 0.3) {
    const heal = enemy.moves.find(m => m.effect?.kind === "heal")
    if (heal && Math.random() < 0.5) return heal
  }
  const w = enemy.moves.map(m => ({ m, w: Math.max(1, m.power * typeEff(m.type as BuddyType, player.type)) }))
  const total = w.reduce((s, x) => s + x.w, 0)
  let r = Math.random() * total
  for (const x of w) { r -= x.w; if (r <= 0) return x.m }
  return w[0].m
}

// ─── Screen Builders ───

function buildBattle(player: Pet, enemy: Pet, log: string[], floor: number, isBoss: boolean, prompt: string, frame = 0, atk?: AtkState, cursor = 0) {
  cls()
  ln(C.bold + div(isBoss ? `BOSS Floor ${floor}/10` : `Floor ${floor}/10`) + C.reset)
  ln()

  let pSpr = colorSprite(animSprite(petSprite(player), player.eye, frame), player)
  let eSpr = colorSprite(animSprite(petSprite(enemy), enemy.eye, frame), enemy)

  if (atk) {
    if (atk.isPlayerAtk) {
      if (atk.frame === 0) pSpr = pSpr.map(l => C.bold + l)
      if (atk.frame === 2) eSpr = eSpr.map(l => C.dim + l + C.reset)
    } else {
      if (atk.frame === 0) eSpr = eSpr.map(l => C.bold + l)
      if (atk.frame === 2) pSpr = pSpr.map(l => C.dim + l + C.reset)
    }
  }

  sideBySide(pSpr, eSpr, 6, atk ? atkGap(atk) : undefined).forEach(l => ln(l))
  ln()

  ln(`  ${padR(player.species, 12)}${C.dim}vs${C.reset}          ${enemy.species}`)
  ln(`  ${petInfoShort(player)}`)
  ln(`  HP ${hpBar(player.hp, player.maxHp, 12)}`)
  ln(`  ${statLine(player)}`)
  ln()
  ln(`  ${petInfoShort(enemy)}`)
  ln(`  HP ${hpBar(enemy.hp, enemy.maxHp, 12)}`)
  ln()

  ln(div("招式"))
  player.moves.forEach((m, i) => {
    const t = m.type === "neutral" ? `${C.dim}--${C.reset}` : typeTag(m.type as BuddyType)
    const eff = m.effect
      ? ` ${C.dim}(${m.effect.kind === "heal" ? "回復" : m.effect.kind === "buff" ? "+" + m.effect.stat : "-" + m.effect.stat})${C.reset}`
      : ""
    const sel = i === cursor
    const pre = sel ? `  ${C.green}>${C.reset} ${C.bold}${i + 1}` : `    ${C.dim}${i + 1}`
    ln(`${pre}${C.reset} ${sel ? C.bold : ""}${m.name.padEnd(18)}${C.reset} [${t}] ${String(m.power).padStart(3)}/${m.accuracy}${eff}`)
  })
  ln()

  ln(div("LOG"))
  if (log.length === 0) ln(`  ${C.dim}...${C.reset}`)
  else log.slice(-4).forEach(l => ln("  " + l))
  ln()
  ln(`  ${C.dim}${prompt}${C.reset}`)
}

function buildDraw(pool: Pet[], cursor: number, selected: Set<number>) {
  cls()
  ln(C.bold + div("抽卡階段") + C.reset)
  ln(`  ${C.dim}選 3 隻組隊  Space 選取 | Enter 確認${C.reset}`)
  ln()

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i]
    const sel = selected.has(i)
    const isCur = i === cursor
    const f = face(p.species, p.eye)
    const sprClr = p.shiny ? C.yellow : TYPE_CLR[p.type]

    let marker: string
    if (isCur && sel) marker = `${C.green}*>${C.reset}`
    else if (isCur) marker = `${C.green} >${C.reset}`
    else if (sel) marker = `${C.green}* ${C.reset}`
    else marker = "  "

    ln(`${marker}${C.bold}${i + 1}${C.reset}  ${sprClr}${f}${C.reset}  ${isCur ? C.bold : ""}${petInfoShort(p)}${C.reset}  HP:${p.maxHp}`)
    ln(`       ${statLine(p)}`)
    ln()
  }

  const picks = [...selected].sort().map(i => i + 1).join(", ")
  const remain = 3 - selected.size
  if (remain > 0) ln(`  ${C.dim}已選: [${picks || "-"}]  還需 ${remain} 隻${C.reset}`)
  else ln(`  ${C.green}已選: [${picks}]  按 Enter 確認${C.reset}`)
}

function buildTeam(team: Pet[], title: string, prompt: string, cursor = -1) {
  cls()
  ln(C.bold + div(title) + C.reset)
  ln()

  let aliveIdx = 0
  for (let i = 0; i < team.length; i++) {
    const p = team[i]
    if (p.hp <= 0) {
      ln(`    ${C.dim}${i + 1}  ${p.species} (KO)${C.reset}`)
      ln()
      continue
    }
    const isCur = aliveIdx === cursor
    const sprLines = colorSprite(petSprite(p), p)
    const infoLines = [petInfoShort(p), `HP ${hpBar(p.hp, p.maxHp, 12)}`, statLine(p)]
    const maxH = Math.max(sprLines.length, infoLines.length)
    for (let j = 0; j < maxH; j++) {
      const spr = padR(sprLines[j] || "", 12)
      const info = infoLines[j] || ""
      const pre = j === 0
        ? (isCur ? `  ${C.green}>${C.reset} ${C.bold}${i + 1}${C.reset} ` : `    ${i + 1} `)
        : "      "
      ln(`${pre}${spr}  ${info}`)
    }
    ln()
    aliveIdx++
  }

  ln(`  ${C.dim}${prompt}${C.reset}`)
}

function buildReward(isBoss: boolean, cursor = 0) {
  cls()
  ln(C.bold + div(isBoss ? "BOSS 獎勵" : "獎勵") + C.reset)
  ln()
  const items = [
    `抽卡 -- 抽一隻新寵物${isBoss ? ` ${C.yellow}(稀有度+)${C.reset}` : ""}`,
    `回復 -- 全隊回復 50% HP`,
    `強化 -- 選一隻寵物 stat +15`,
  ]
  items.forEach((item, i) => {
    const sel = i === cursor
    ln(`  ${sel ? `${C.green}>${C.reset} ${C.bold}` : `  ${C.dim}`}${i + 1}${C.reset}  ${sel ? C.bold : ""}${item}${C.reset}`)
  })
  ln()
  ln(`  ${C.dim}上下選擇 | Enter 確認${C.reset}`)
}

function buildNewPet(p: Pet, team: Pet[], cursor = 0) {
  cls()
  ln(C.bold + div("新寵物") + C.reset)
  ln()
  const sprLines = colorSprite(petSprite(p), p)
  const infoLines = [petInfoShort(p), `HP ${hpBar(p.hp, p.maxHp, 12)}`, statLine(p)]
  const maxH = Math.max(sprLines.length, infoLines.length)
  for (let j = 0; j < maxH; j++) {
    const spr = padR(sprLines[j] || "", 12)
    const info = infoLines[j] || ""
    ln(`    ${spr}  ${info}`)
  }
  ln()
  ln(div("替換?"))
  const opts = ["不替換", ...team.map((t, i) => {
    const alive = t.hp > 0
    return `${alive ? face(t.species, t.eye) : C.dim + "KO" + C.reset}  ${alive ? petInfoShort(t) : C.dim + t.species + C.reset}`
  })]
  opts.forEach((item, i) => {
    const sel = i === cursor
    ln(`  ${sel ? `${C.green}>${C.reset} ${C.bold}` : `  ${C.dim}`}${i}${C.reset}  ${item}`)
  })
  ln()
  ln(`  ${C.dim}上下選擇 | Enter 確認${C.reset}`)
}

function buildFloorIntro(floor: number, enemy: Pet, isBoss: boolean) {
  cls()
  if (isBoss) {
    ln()
    ln(`  ${C.red}${C.bold}  !!  B O S S  !!${C.reset}`)
  }
  ln()
  ln(C.bold + div(`Floor ${floor}/10`) + C.reset)
  ln()
  const sprLines = colorSprite(petSprite(enemy), enemy)
  const infoLines = [petInfoShort(enemy), `HP ${hpBar(enemy.hp, enemy.maxHp, 14)}`, statLine(enemy)]
  const maxH = Math.max(sprLines.length, infoLines.length)
  for (let j = 0; j < maxH; j++) {
    const spr = padR(sprLines[j] || "", 12)
    const info = infoLines[j] || ""
    ln(`      ${spr}  ${info}`)
  }
  ln()
  ln(`  ${C.dim}按任意鍵開始${C.reset}`)
}

// ─── Game Phases ───

async function drawPhase(): Promise<Pet[]> {
  const pool: Pet[] = []
  let hasGood = false
  for (let i = 0; i < 5; i++) {
    let p = generatePet()
    if (i === 4 && !hasGood) while (p.rarity === "common") p = generatePet()
    if (p.rarity !== "common") hasGood = true
    pool.push(p)
  }

  const indices = await selectMulti(5, 3, (cur, sel) => buildDraw(pool, cur, sel))
  return indices.map(i => pool[i])
}

async function battlePhase(player: Pet, enemy: Pet, floor: number, isBoss: boolean): Promise<boolean> {
  const log: string[] = []

  while (player.hp > 0 && enemy.hp > 0) {
    // Idle animation + cursor selection
    const moveIdx = await selectOneAnim(
      4,
      (cur, f) => buildBattle(player, enemy, log, floor, isBoss, "上下選擇 | Enter 確認", f, undefined, cur),
      400,
    )

    const pMove = player.moves[moveIdx]
    const eMove = enemyAI(enemy, player)
    const playerFirst = player.stats.SNARK >= enemy.stats.SNARK

    const turns: [Pet, Pet, Move, boolean][] = playerFirst
      ? [[player, enemy, pMove, true], [enemy, player, eMove, false]]
      : [[enemy, player, eMove, false], [player, enemy, pMove, true]]

    for (const [atk, def, move, isPlayer] of turns) {
      if (atk.hp <= 0) break
      const tag = isPlayer ? `${C.green}>>>${C.reset}` : `${C.red}<<<${C.reset}`

      // Attack animation: 3 frames (charge -> travel -> impact)
      for (let af = 0; af < 3; af++) {
        buildBattle(player, enemy, log, floor, isBoss, `${atk.species}: ${move.name}!`, 0, {
          moveType: move.type, isPlayerAtk: isPlayer, frame: af,
        })
        render()
        await waitOrKey(200)
      }

      // Calculate and apply damage
      if (move.power === 0 && move.effect?.kind === "heal") {
        const msg = applyEffect(move, atk, def)
        log.push(`${tag} ${atk.species}: ${move.name} ${msg}`)
      } else {
        const r = calcDamage(atk, def, move)
        if (r.miss) {
          log.push(`${tag} ${atk.species}: ${move.name} ${C.dim}MISS${C.reset}`)
        } else {
          def.hp -= r.dmg
          let msg = `${tag} ${atk.species}: ${move.name}`
          if (r.eff > 1) msg += ` ${C.yellow}超有效!${C.reset}`
          else if (r.eff < 1) msg += ` ${C.dim}不太有效${C.reset}`
          if (r.crit) msg += ` ${C.yellow}暴擊!${C.reset}`
          msg += ` -${r.dmg}`
          const effMsg = applyEffect(move, atk, def)
          if (effMsg) msg += ` ${C.dim}(${effMsg})${C.reset}`
          log.push(msg)
        }
      }

      if (def.hp <= 0) log.push(`${C.bold}${def.species} 倒下了!${C.reset}`)

      buildBattle(player, enemy, log, floor, isBoss, "...")
      render()
      await waitOrKey(500)
    }
  }

  const won = player.hp > 0
  await anyKeyAnim(
    (f) => buildBattle(player, enemy, log, floor, isBoss,
      won ? `${C.green}勝利! 按任意鍵繼續${C.reset}` : `${C.red}戰敗... 按任意鍵${C.reset}`, f),
    400,
  )
  return won
}

async function rewardPhase(team: Pet[], floor: number): Promise<void> {
  const isBoss = floor === 5 || floor === 10

  const choice = await selectOne(3, (cur) => buildReward(isBoss, cur))

  if (choice === 0) {
    let p: Pet
    if (isBoss) {
      let att = 0
      do { p = generatePet(); att++ } while (RARITIES.indexOf(p.rarity) < 1 && att < 100)
    } else {
      p = generatePet()
    }
    const swap = await selectOne(team.length + 1, (cur) => buildNewPet(p, team, cur))
    if (swap > 0) {
      p.hp = p.maxHp
      team[swap - 1] = p
    }
  } else if (choice === 1) {
    for (const p of team) {
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5))
    }
    buildTeam(team, "全隊回復!", "按任意鍵繼續")
    render()
    await anyKey()
  } else {
    const alive = team.filter(p => p.hp > 0)
    if (alive.length === 0) return
    const idx = await selectOne(alive.length, (cur) => buildTeam(team, "選一隻寵物強化", "上下選擇 | Enter 確認", cur))
    const target = alive[idx]
    const stat = STATS[Math.floor(Math.random() * STATS.length)]
    target.stats[stat] = Math.min(100, target.stats[stat] + 15)
    if (stat === "PATIENCE") {
      target.maxHp = target.stats.PATIENCE * 2 + 50
      target.hp = Math.min(target.maxHp, target.hp + 30)
    }
    cls()
    ln(C.bold + div("強化") + C.reset)
    ln()
    const sprLines = colorSprite(petSprite(target), target)
    sprLines.forEach(l => ln("      " + l))
    ln()
    ln(`  ${target.species} 的 ${C.bold}${stat}${C.reset} +15!  (${target.stats[stat]})`)
    ln()
    ln(`  ${C.dim}按任意鍵繼續${C.reset}`)
    render()
    await anyKey()
  }
}

// ─── Main ───

async function main() {
  if (!process.stdin.isTTY) {
    console.error("需要互動式終端機 (TTY)")
    process.exit(1)
  }

  // Title
  cls()
  ln()
  ln(`${C.bold}  ╔══════════════════════════════════════╗`)
  ln(`  ║       BUDDY BATTLE : Roguelike       ║`)
  ln(`  ╚══════════════════════════════════════╝${C.reset}`)
  ln()
  ln(`  ${C.dim}混沌 > 野性 > 秩序 > 混沌${C.reset}`)
  ln(`  ${C.dim}10 層突破 | 抽卡組隊 | 回合制對戰${C.reset}`)
  ln()
  ln(`  ${C.dim}按任意鍵開始${C.reset}`)
  render()
  await anyKey()

  // Draw
  const team = await drawPhase()

  // Show team
  buildTeam(team, "你的隊伍", "按任意鍵出發")
  render()
  await anyKey()

  // Floors
  for (let floor = 1; floor <= 10; floor++) {
    const isBoss = floor === 5 || floor === 10
    const enemy = generateEnemy(floor)

    buildFloorIntro(floor, enemy, isBoss)
    render()
    await anyKey()

    let won = false
    while (!won) {
      const alive = team.filter(p => p.hp > 0)
      if (alive.length === 0) {
        cls()
        ln()
        ln(`  ${C.red}${C.bold}  G A M E  O V E R${C.reset}`)
        ln()
        ln(`  到達 Floor ${floor}/10`)
        ln()
        team.forEach((p, i) => {
          ln(`  ${face(p.species, p.eye)}  ${p.species} ${C.dim}(KO)${C.reset}`)
        })
        ln()
        ln(`  ${C.dim}按任意鍵離開${C.reset}`)
        render()
        await anyKey()
        cleanup()
        return
      }

      let selected: Pet
      if (alive.length === 1) {
        selected = alive[0]
      } else {
        const idx = await selectOne(alive.length, (cur) =>
          buildTeam(team, `選擇出戰寵物 (Floor ${floor})`, "上下選擇 | Enter 確認", cur))
        selected = alive[idx]
      }

      won = await battlePhase(selected, enemy, floor, isBoss)

      if (!won) {
        selected.hp = 0
        const rem = team.filter(p => p.hp > 0)
        if (rem.length > 0) {
          cls()
          ln()
          ln(`  ${C.red}${selected.species} 被擊敗了...${C.reset}`)
          ln(`  還剩 ${rem.length} 隻可以戰鬥`)
          ln(`  敵人 HP: ${hpBar(enemy.hp, enemy.maxHp, 12)}`)
          ln()
          ln(`  ${C.dim}按任意鍵繼續${C.reset}`)
          render()
          await anyKey()
        }
      }
    }

    if (floor < 10) {
      // Floor clear
      cls()
      ln()
      ln(`  ${C.green}${C.bold}Floor ${floor} 通過!${C.reset}`)
      ln()
      ln(`  ${C.dim}按任意鍵選擇獎勵${C.reset}`)
      render()
      await anyKey()

      await rewardPhase(team, floor)

      // Team status
      buildTeam(team, `隊伍狀態 (${floor}/10)`, "按任意鍵前往下一層")
      render()
      await anyKey()
    }
  }

  // Victory
  cls()
  ln()
  ln(`  ${C.yellow}${C.bold}  V I C T O R Y${C.reset}`)
  ln()
  ln(`  ${C.bold}恭喜通關! 全 10 層突破!${C.reset}`)
  ln()
  ln(div("最終隊伍"))
  for (const p of team) {
    const sprLines = colorSprite(petSprite(p), p)
    const alive = p.hp > 0
    const infoLines = alive
      ? [petInfoShort(p), `HP ${hpBar(p.hp, p.maxHp, 12)}`, statLine(p)]
      : [`${C.dim}${p.species} (犧牲)${C.reset}`]
    const maxH = Math.max(sprLines.length, infoLines.length)
    for (let j = 0; j < maxH; j++) {
      const spr = padR(alive ? sprLines[j] || "" : (j === 0 ? `${C.dim}${sprLines[0]}${C.reset}` : ""), 12)
      const info = infoLines[j] || ""
      ln(`    ${spr}  ${info}`)
    }
    ln()
  }
  ln(`  ${C.dim}按任意鍵離開${C.reset}`)
  render()
  await anyKey()
  cleanup()
}

main().catch(e => { cleanup(); console.error(e); process.exit(1) })
