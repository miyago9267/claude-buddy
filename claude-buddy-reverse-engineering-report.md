# Claude Code /buddy 逆向工程分析報告

> Binary: Claude Code v2.1.89 -> v2.1.90 (Mach-O arm64, Bun compiled)
> 初次分析: 2026-04-01 (v2.1.89)
> v2.1.90 驗證: 2026-04-02 (確認 salt 規則與生成邏輯完全未變，修正 stats 公式)
> 分析師: Monika (via Claude Code)

---

## 1. 執行摘要

`/buddy` 是 Claude Code 內建的 Easter Egg 功能（v2.1.89 初次逆向，v2.1.90 驗證無變更）。它是一個 **確定性 + API 混合架構** 的寵物系統。

**結論: 外觀（bones）寫死在帳號上不可改，名字和個性（soul）由 API 生成但可以改。**

可操作性矩陣:

| 屬性 | 生成方式 | 儲存位置 | 可否修改 | 風險 |
|------|----------|----------|----------|------|
| species | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| rarity | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| eye | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| hat | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| shiny | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| stats | 確定性 PRNG | 不存檔，每次重算 | 不可能 | -- |
| **name** | **API 生成** | **`~/.claude.json`** | **可改** | **低** |
| **personality** | **API 生成** | **`~/.claude.json`** | **可改** | **低** |
| companionMuted | 使用者操作 | `~/.claude.json` | 可改 | 無 |
| hatchedAt | 時間戳 | `~/.claude.json` | 可改 | 低 |

### Miyago 的預測結果 (基於帳號 UUID 模擬)

| 屬性 | 值 |
|------|-----|
| Rarity | **common** (60%) |
| Species | **snail** |
| Eye | **&#x25C9;** |
| Hat | none (common 不給帽子) |
| Shiny | false |
| DEBUGGING | 32 |
| PATIENCE | 43 |
| CHAOS | 43 |
| **WISDOM** | **75** (primary boost) |
| SNARK | 1 (nerfed) |
| Inspiration words | drizzle, warble, plinth, yoke |

> 注意: 此預測基於 Bun.hash (wyhash64) 在實際 Bun runtime 中的執行結果。

---

## 2. 架構總覽

```text
/buddy 命令執行流程:

1. 讀取 userId
   hN6() -> oauthAccount?.accountUuid ?? userID ?? "anon"

2. 計算 bones（確定性，不可控）
   vN6(userId):
     seed = hash(userId + "friend-2026-401")
     prng = SplitMix32(seed)
     bones = { rarity, species, eye, hat, shiny, stats }

3. 生成 soul（API 呼叫，有 fallback）
   nk7(bones, seed, abortSignal):
     -> POST to Claude API (querySource: "buddy_companion")
     -> model: yf() (likely haiku)
     -> 回傳: { name, personality }
     -> 失敗時 fallback: p35() 從 ["Crumpet","Soup","Pickle","Biscuit","Moth","Gravy"] 選

4. 合併並持久化
   S_((state) => ({ ...state, companion: { ...bones, ...soul, hatchedAt: Date.now() } }))
   -> 寫入 ~/.claude.json 的 companion 欄位

5. 觸發首次反應
   Fk7(companion, setReaction)
   -> 另一個 API 呼叫生成 hatch 語音泡泡
```

---

## 3. 確定性生成演算法（完整還原）

> **v2.1.90 符號對照**: 函數名因 minification 改變，邏輯不變。
> `aN4`→`ME4`, `oN4`→`DE4`, `sN4`→`PE4`, `eN4`→`XE4`, `DZH`→`CZH`,
> `HV4`→`WE4`, `vN6`→`vV6`, `hN6`→`hV6`
> 本文保留 v2.1.89 的符號名以維持一致性。

### 3.1 Hash 函式

```javascript
// aN4: 在 Bun runtime 使用 Bun.hash，否則 FNV-1a
function aN4(str) {
  if (typeof Bun !== "undefined")
    return Number(BigInt(Bun.hash(str)) & 0xffffffffn);
  // FNV-1a fallback
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
```

**重要**: Claude Code 是 Bun compiled binary，所以實際使用 `Bun.hash()`（Wyhash），與 FNV-1a fallback 結果不同。這表示你無法用 Node.js 準確預測結果。

### 3.2 PRNG (SplitMix32)

```javascript
function oN4(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

### 3.3 Seed 組合

```javascript
const HV4 = "friend-2026-401";  // 全域 salt
const userId = oauthAccount?.accountUuid ?? userID ?? "anon";
const seed = aN4(userId + HV4);  // hash("你的UUID" + "friend-2026-401")
const prng = oN4(seed);
```

### 3.4 Trait 生成（呼叫順序很重要）

PRNG 的輸出是序列化的，每次呼叫 `prng()` 推進狀態。traits 按以下嚴格順序生成:

```javascript
const rarity = sN4(prng);                          // 1 次 prng()
const species = DZH(prng, speciesPool);             // 1 次 prng()
const eye = DZH(prng, eyePool);                     // 1 次 prng()
const hat = rarity === "common" ? "none" : DZH(prng, hatPool); // 0 或 1 次 prng()
const shiny = prng() < 0.01;                        // 1 次 prng()
const stats = eN4(prng, rarity);                     // 多次 prng()
```

### 3.5 Rarity 權重

```javascript
{ common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }
// 總權重: 100
// common: 60%, uncommon: 25%, rare: 10%, epic: 4%, legendary: 1%
```

### 3.6 物種池 (18 種)

```
duck, goose, blob, cat, dragon, octopus, owl, penguin,
turtle, snail, ghost, axolotl, capybara, cactus, robot,
rabbit, mushroom, chonk
```

### 3.7 眼睛池 (6 種)

```
· (middle dot), ✦ (star), × (multiply), ◉ (circle), @ (at), ° (degree)
```

### 3.8 帽子池 (8 種，common 沒有帽子)

```
none, crown, tophat, propeller, halo, wizard, beanie, tinyduck
```

### 3.9 Stats

- 5 項: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
- Base 值由 rarity 決定: common=5, uncommon=15, rare=25, epic=35, legendary=50
- 隨機選 1 個 primary stat (boosted) 和 1 個 secondary stat (nerfed):

```javascript
// 三層公式 (v2.1.90 驗證，修正原 v2.1.89 報告的錯誤)
if (stat === primary)   Math.min(100, base + 50 + floor(rng()*30))  // boosted
if (stat === secondary) Math.max(1, base - 10 + floor(rng()*15))    // nerfed
else                    base + floor(rng()*40)                       // normal
```

| Rarity | Boosted 範圍 | Nerfed 範圍 | Normal 範圍 |
|--------|-------------|------------|------------|
| common | 55-84 | 1-9 | 5-44 |
| uncommon | 65-94 | 5-19 | 15-54 |
| rare | 75-100 | 15-29 | 25-64 |
| epic | 85-100 | 25-39 | 35-74 |
| legendary | 100 | 40-54 | 50-89 |

---

## 4. 持久化機制

### 4.1 設定檔路徑

```javascript
// BP() 解析順序:
// 1. ~/.claude/.config.json (如果存在)
// 2. $CLAUDE_CONFIG_DIR/.claude.json (如果設了環境變數)
// 3. ~/.claude.json (預設)
```

### 4.2 資料結構

**關鍵發現: bones 不存在 JSON 中。** 只有 soul 資料被持久化:

```json
{
  "companion": {
    "name": "Bramble",
    "personality": "Insists every variable should be named after a type of cheese.",
    "hatchedAt": 1743523200000
  },
  "companionMuted": false,
  "companionPetAt": null,
  "companionReaction": null
}
```

### 4.3 讀寫機制

- **讀取**: `rE()` 從 `z_().companion` 讀取 name/personality，然後**每次重新計算 bones**:

```javascript
function rE() {
  let H = z_().companion;   // 讀本地 JSON (只有 name, personality, hatchedAt)
  if (!H) return;
  let { bones } = vN6(hN6()); // 每次重算 species/rarity/eye/hat/stats
  return { ...H, ...bones };   // 合併: bones 永遠是新算的
}
```

- **寫入**: `S_(updater)` 使用 atomic write (read-modify-write with file lock)
- **無 server-side 同步**: companion 資料**只存在本地**，不會上傳到 Anthropic server
- **bones 不可篡改**: 因為根本不讀 JSON 裡的 bones，每次都從 userId 重算

---

## 5. API 呼叫分析

### 5.1 Reaction API (buddy_react)

```
POST https://api.anthropic.com/api/organizations/{orgUUID}/claude_code/buddy_react
Authorization: Bearer {oauthToken}
anthropic-beta: oauth-2025-04-20

Payload: { name, personality, species, rarity, stats, transcript, reason, recent, addressed }
Response: { "reaction": "<text>" }

reason 類型: "hatch" | "turn" | "pet" | "test-fail" | "error" | "large-diff"
```

**沒有 registration endpoint.** 這個 API 只生成反應文字，不註冊或驗證 buddy。

### 5.2 Soul 生成 (nk7)

```
Endpoint: Claude API (standard messages endpoint)
Query Source: "buddy_companion"
Model: yf() (likely claude-haiku)
Max Tokens: 512
Temperature: 1

System Prompt:
"You generate coding companions -- small creatures that live in a developer's
terminal and occasionally comment on their work.
Given a rarity, species, stats, and a handful of inspiration words, invent:
- A name: ONE word, max 12 characters. Memorable, slightly absurd.
  No titles, no 'the X', no epithets. Think pet name, not NPC name.
  The inspiration words are loose anchors -- riff on one, mash two syllables,
  or just use the vibe. Examples: Pith, Dusker, Crumb, Brogue, Sprocket.
- A one-sentence personality (specific, funny, a quirk that affects how
  they'd comment on code -- should feel consistent with the stats)
Higher rarity = weirder, more specific, more memorable.
A legendary should be genuinely strange.
Don't repeat yourself -- every companion should feel distinct."

Output Schema (Zod):
{
  name: string (1-14 chars),
  personality: string
}
```

**Inspiration Words**: 從固定 word pool 中用 PRNG seed 選 4 個 (m35 函式)

### 5.3 Fallback 機制

如果 API 呼叫失敗，使用本地 fallback:

```javascript
function p35(bones) {
  const idx = bones.species.charCodeAt(0) + bones.eye.charCodeAt(0);
  return {
    name: ["Crumpet","Soup","Pickle","Biscuit","Moth","Gravy"][idx % 6],
    personality: `A ${bones.rarity} ${bones.species} of few words.`
  };
}
```

### 5.4 反應生成 (Fk7, Uk7, Ui_)

Buddy 的語音泡泡（reactions）也是 API 呼叫:
- `hatch`: 孵化時的第一句話
- `pet`: 被 `/buddy pet` 時的反應
- 一般反應: 回應使用者的 coding session context
- 這些呼叫**不計入 token 使用量**

---

## 6. 可操作性分析

### 6.1 能改什麼 (合法手段)

**Soul (name + personality) 可以改:**

1. `/buddy` 孵化後，companion 資料寫入 `~/.claude.json`
2. `name` 和 `personality` 欄位來自 API，不是確定性計算
3. 程式碼中 `rE()` 讀取 companion 時，**不會重新驗證 name/personality**
4. 直接編輯 `~/.claude.json` 的 `companion.name` 和 `companion.personality` 是安全的

```bash
# 孵化後，修改名字和個性:
# (假設已經跑過 /buddy)
jq '.companion.name = "MyCustomName" | .companion.personality = "My custom personality"' \
  ~/.claude.json > /tmp/claude_tmp.json && mv /tmp/claude_tmp.json ~/.claude.json
```

**companionMuted 可以改:**
- `/buddy off` 設 `companionMuted: true`
- `/buddy on` 設 `companionMuted: false`
- 直接改 JSON 也行

### 6.2 不能改什麼

**Bones (species, rarity, eye, hat, shiny, stats) 不能改:**

原因: `vN6(userId)` 有 cache 機制 (`kN6`)，但更重要的是 **bones 資料在 companion 物件內部儲存**，程式主要透過 `rE()` 讀取，而 `rE()` 直接回傳 `z_().companion`，**不會重算 bones**。

但是 -- 如果你清除 companion 然後重新 `/buddy`，`r35()` 會重新呼叫 `vN6(hN6())`，重新計算 bones。所以:

- **改本地 JSON 的 bones 值**: 理論上可以，`rE()` 不驗證
- **重新孵化**: 會用相同 seed 算出相同結果

### 6.3 攻擊面: 預先建構 companion

**方法 A: 預先寫入法 (最可行)**

```bash
# 如果在 /buddy 之前就寫入 companion 欄位:
# rE() 找到已存在的 companion -> /buddy 直接顯示，跳過孵化
# bones 永遠從 userId 重算，所以 species/rarity 不受影響
# 但 name 和 personality 會用你寫入的值

# 步驟:
python3 -c "
import json, os
path = os.path.expanduser('~/.claude.json')
try:
    with open(path) as f: cfg = json.load(f)
except: cfg = {}
cfg['companion'] = {
    'name': 'YourCustomName',
    'personality': 'Your custom personality description.',
    'hatchedAt': 1743523200000
}
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
print('Pre-crafted companion written.')
"
```

**方法 A-2: 孵化後修改 (最安全)**

```bash
# 1. 先正常跑 /buddy 讓它孵化
# 2. 孵化後修改 name 和 personality
jq '.companion.name = "YourName" | .companion.personality = "Your personality"' \
  ~/.claude.json > /tmp/claude_tmp.json && mv /tmp/claude_tmp.json ~/.claude.json
```

**方法 B: 攔截 API 回應法 (進階)**

```bash
# 理論上可以用 mitmproxy 攔截 nk7 的 API 呼叫
# 替換回應的 name/personality
# 但這對 HTTPS pinning 可能有困難
# 而且結果跟方法 A 一樣，不值得
```

**方法 C: 環境變數法 (理論)**

```bash
# CLAUDE_CONFIG_DIR 可以指向自訂路徑
# 但這會影響所有 Claude Code 設定，不實際
```

**方法 D: Binary Salt Patching (已驗證可行)**

最終採用的方法。透過 brute-force 搜索替代 salt 值，找到能產生目標 rarity/species 的組合，
然後 patch binary 裡的 salt 字串。

```bash
# 1. Brute-force 找到目標 salt (Bun script，使用 Bun.hash 確保結果一致)
bun buddy-bruteforce.ts <userId>

# 2. Verify 模擬結果
bun buddy-verify.ts <salt>

# 3. Patch binary + re-sign
bash buddy-patch.sh <salt>

# 4. 啟動 Claude Code，跑 /buddy
```

**關鍵陷阱: macOS Code Signature**

Claude Code binary 有 Hardened Runtime code signature (`flags=0x10000(runtime)`,
TeamIdentifier `Q6L2SF6YDW`)。直接修改 binary 內容會導致簽章失效，
macOS Gatekeeper 拒絕執行。

解法：patch 後用 ad-hoc signature 重簽：

```bash
codesign --remove-signature "$binary"
codesign -s - -f --preserve-metadata=entitlements "$binary"
```

此方法已實際驗證成功。`buddy-patch.sh` 已內建自動重簽邏輯。

**注意事項:**
- Claude Code 自動更新會覆蓋 binary，更新後需重新 patch (v2.1.90 已驗證 salt 未變，直接重 patch 即可)
- Salt 必須與原始 salt (`friend-2026-401`) 等長 (15 字元)
- Bones (species/rarity/eye/hat/stats) 每次從 userId 重算，無法透過改 JSON 修改

---

## 7. 關鍵發現

### 7.1 沒有 Server-Side Registration

逆向分析確認: **companion 資料完全存在本地，沒有 server-side 註冊機制。**

- Soul 生成 (nk7) 是一次性 API 呼叫，用標準 Claude messages API
- 結果存入本地 `~/.claude.json`，不會同步回 server
- 後續 `/buddy` 呼叫只讀本地檔案
- 沒有發現任何 `companion.*register` 或 `companion.*sync` 端點

### 7.2 `rE()` 每次重算 bones

```javascript
function rE() {
  let H = z_().companion;          // 只讀 name, personality, hatchedAt
  if (!H) return;
  let { bones } = vN6(hN6());      // 每次從 userId 重算所有 bones
  return { ...H, ...bones };        // bones 覆蓋 JSON 值
}
```

這表示:
- 改 `~/.claude.json` 裡的 name/personality，Claude Code 會直接使用
- bones (species/rarity/eye/hat/stats) 不可能被篡改 -- 每次都是重算的

### 7.3 Feature Gate

```javascript
function LK8() {
  if (y8() !== "firstParty") return false;  // 只限 first-party client
  if (AO()) return false;                    // 某些條件排除
  let H = new Date;
  return H.getFullYear() > 2026 ||
         (H.getFullYear() === 2026 && H.getMonth() >= 3);
  // getMonth() >= 3 表示 April 或之後 (0-indexed)
}
```

**`/buddy` 從 2026 年 4 月起永久啟用** (不是只有 April Fools)。

### 7.4 Telemetry

沒有發現 buddy 專用的 telemetry event (`Q("...")`)。
buddy 的 API 呼叫使用 `querySource: "buddy_companion"` 標記，
但這只是一般的 API 計量標記，不是行為追蹤。

---

## 8. 實際操作建議

### 推薦流程:

1. **先跑 `/buddy`** -- 讓系統正常孵化
2. **接受你的 bones** -- species/rarity/eye/hat/stats 是用 userId 確定性算的，改不了
3. **如果不滿意 name/personality，修改 `~/.claude.json`**:

```bash
# 備份
cp ~/.claude.json ~/.claude.json.bak

# 修改 (替換 YOUR_NAME 和 YOUR_PERSONALITY)
python3 -c "
import json
with open('$HOME/.claude.json', 'r') as f:
    cfg = json.load(f)
cfg['companion']['name'] = 'YOUR_NAME'
cfg['companion']['personality'] = 'YOUR_PERSONALITY'
with open('$HOME/.claude.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Done. companion name/personality updated.')
"
```

4. **如果想先指定名字再孵化**: 在跑 `/buddy` 之前，直接寫入 companion 欄位到 `~/.claude.json`（見 6.3 方法 A）
5. **不要刪除 companion 欄位重抽** -- 結果完全一樣（確定性）

### 改不了的:

- species, rarity, eye, hat, shiny, stats -- bones 每次從 userId 重算，根本不讀 JSON
- 換帳號重抽理論可行，但不實際

### Miyago 的原始命運 (未 patch):

原本是一隻 **common snail**，眼睛是 &#x25C9;，沒有帽子，不 shiny。
WISDOM 最高 (75, boosted)，SNARK 被 nerf 到 1 (nerfed)。

### 實際結果 (patch 後):

透過 binary salt patching (`friend-2026-401` -> `3s58p6-e-b260y-`)，
最終孵化出 **LEGENDARY SHINY CAT** "Brineclaw"。

| 屬性 | 值 |
|------|-----|
| Name | **Brineclaw** (API 生成) |
| Rarity | **LEGENDARY** |
| Species | **cat** |
| Eye | @ |
| Hat | tinyduck (頭頂小鴨) |
| Shiny | **YES** |
| DEBUGGING | 58 |
| PATIENCE | 74 |
| CHAOS | **100** (boosted) |
| WISDOM | 53 (nerfed) |
| SNARK | 78 |
| Salt used | `3s58p6-e-b260y-` |
| Inspiration words | ingot, rook, warble, brine |

工具鏈: `buddy-bruteforce.ts` (搜索) -> `buddy-verify.ts` (驗證) -> `buddy-patch.sh` (patch + re-sign)

---

## 附錄 A: 完整 Species ASCII Art 對照

每個 species 有 3 個動畫幀。以 cat 為例:

```
   /\_/\
  ( ·   · )
  (  ω  )
  (")"(")\
```

## 附錄 B: Rarity 配色

| Rarity | 顏色 token | 星等 |
|--------|-----------|------|
| common | inactive (灰) | ★ |
| uncommon | success (綠) | ★★ |
| rare | permission (紫) | ★★★ |
| epic | autoAccept (?) | ★★★★ |
| legendary | warning (金) | ★★★★★ |

## 附錄 C: Fallback Name Pool

API 失敗時的 fallback 名字:
```
Crumpet, Soup, Pickle, Biscuit, Moth, Gravy
```

選擇方式: `(species.charCodeAt(0) + eye.charCodeAt(0)) % 6`

## 附錄 D: Inspiration Word Pool

Soul 生成時提供給 API 的 inspiration words (共 120+ 個):

```
thunder, biscuit, void, accordion, moss, velvet, rust, pickle, crumb,
whisper, gravy, frost, ember, soup, marble, thorn, honey, static,
copper, dusk, sprocket, bramble, cinder, wobble, drizzle, flint,
tinsel, murmur, clatter, gloom, nectar, quartz, shingle, tremor,
umber, waffle, zephyr, bristle, dapple, fennel, gristle, huddle,
kettle, lumen, mottle, nuzzle, pebble, quiver, ripple, sable,
thistle, vellum, wicker, yonder, bauble, cobble, doily, fickle,
gambit, hubris, jostle, knoll, larder, mantle, nimbus, oracle,
plinth, quorum, relic, spindle, trellis, urchin, vortex, warble,
xenon, yoke, zenith, alcove, brogue, chisel, dirge, epoch, fathom,
glint, hearth, inkwell, jetsam, kiln, lattice, mirth, nook, obelisk,
parsnip, quill, rune, sconce, tallow, umbra, verve, wisp, yawn,
apex, brine, crag, dregs, etch, flume, gable, husk, ingot, jamb,
knurl, loam, mote, nacre, ogle, prong, quip, rind, slat, tuft,
vane, welt, yarn, bane, clove, dross, eave, fern, grit, hive,
jade, keel, lilt, muse, nape, omen, pith, rook, silt, tome,
urge, vex, wane, yew, zest
```

---

## Legendary Buddy 完整目錄

> userId: `cd7cdfd4-099f-4165-89e6-dfbb0554c6c2`
> 搜索範圍: 557,800+ 組合
> 找到: 5578 legendary (其中 75 shiny)

### SHINY Legendary (最稀有)

| Salt | Species | Eye | Hat | Shiny | DEB | PAT | CHA | WIS | SNK | Words |
|------|---------|-----|-----|-------|-----|-----|-----|-----|-----|-------|
| `friend-2026-ao_` | 🦫 capybara | × | wizard | YES | 74 | 33 | 57 | 44 | **94** | dirge, kiln, doily, mirth |
| `friend-2026-dje` | 🦫 capybara | × | crown | YES | 58 | 94 | **100** | 71 | 23 | gristle, quartz, jostle, inkwell |
| `friend-2026-hdp` | 🦆 duck | ◉ | beanie | YES | 78 | 23 | **97** | 79 | 23 | ripple, apex, ember, obelisk |
| `friend-2026-t5f` | 🦆 duck | ✦ | wizard | YES | **87** | 21 | 58 | 66 | 77 | murmur, relic, gable, zephyr |
| `friend-2026-8_9` | 🐾 chonk | ✦ | propeller | YES | 47 | 57 | 77 | 62 | **95** | fickle, yew, ogle, bane |
| `friend-2026-9e9` | 🍄 mushroom | × | beanie | YES | 74 | 43 | 22 | 79 | **95** | nacre, fickle, umber, bramble |
| `bwb3j5it882k7o9` | 🌵 cactus | ◉ | tophat | YES | **97** | 62 | 54 | 81 | 45 | bauble, yoke, kettle, umbra |
| `9va01agxvztzub5` | 🦆 duck | ✦ | tinyduck | YES | 35 | 80 | **100** | 29 | 67 | yew, cobble, marble, pickle |
| `l_ehc6vaz9yr77g` | 🪿 goose | ◉ | none | YES | 47 | 85 | **100** | 51 | 63 | chisel, xenon, lumen, mottle |
| `wy03n23mlejgddu` | 👻 ghost | × | none | YES | 44 | **100** | **100** | 68 | 36 | urchin, verve, fennel, parsnip |
| `o7k4o31v4la2e1g` | 🦫 capybara | ✦ | beanie | YES | 25 | 72 | 94 | **100** | 35 | slat, dregs, mantle, omen |
| `gnczh25mkrr90hy` | 🌵 cactus | ° | crown | YES | 78 | 33 | 79 | 86 | **90** | velvet, tome, umbra, hearth |
| `utl5fl81r525r12` | 🌵 cactus | · | halo | YES | 72 | **100** | **100** | 20 | 64 | flint, honey, urchin, gristle |
| `5f3rk-56k-qgsk7` | 🐙 octopus | · | tophat | YES | 41 | 84 | 54 | **85** | 69 | gambit, quip, clatter, fennel |
| `2kbi9_ydg13wx9j` | 🤖 robot | @ | tophat | YES | **100** | 32 | **100** | 53 | 41 | ingot, dirge, yonder, keel |
| `iimx0q-29hq1g7i` | 🤖 robot | @ | crown | YES | 74 | 61 | **98** | 79 | 40 | mote, tinsel, cobble, rind |
| `34mwvut5c_1aaoq` | 🐧 penguin | @ | halo | YES | 94 | **100** | 76 | 46 | 68 | warble, crumb, huddle, rook |
| `p-o689716nq1d_g` | 🐉 dragon | ◉ | tophat | YES | **100** | 39 | 50 | 65 | 77 | bane, quorum, ember, yoke |
| `4u5ag7x1xw1b492` | 🐧 penguin | @ | tinyduck | YES | 75 | **100** | 77 | 40 | 60 | quorum, bauble, soup, drizzle |
| `a596b07y1be-hkn` | 🐢 turtle | @ | tophat | YES | **100** | 30 | 83 | 41 | 60 | nimbus, vellum, dross, urchin |
| `llaya92eluc5-hh` | 🦫 capybara | ° | none | YES | 55 | 39 | **100** | 79 | 63 | zephyr, wobble, fern, oracle |
| `gsusmcu27heajah` | 🐰 rabbit | · | crown | YES | 36 | **100** | 67 | 45 | 91 | crag, drizzle, clove, husk |
| `3zq76nq2xh43hgi` | 🦉 owl | ° | propeller | YES | 50 | 48 | 88 | **99** | 59 | kettle, crag, yew, sable |
| `6ewwyfg-2fi54dh` | 🦫 capybara | ✦ | beanie | YES | 53 | 79 | 40 | **100** | **100** | lilt, tuft, inkwell, zenith |
| `1ol4a2jx6_jtcix` | 🐢 turtle | ° | tophat | YES | 84 | 53 | 25 | **96** | 69 | inkwell, prong, frost, wicker |
| `4d8i07hpbcwukvz` | 🐧 penguin | × | tinyduck | YES | 75 | 65 | 59 | **100** | 92 | murmur, nimbus, oracle, lattice |
| `gm8rtp_2mm0gmru` | 🐉 dragon | @ | halo | YES | 74 | 47 | 96 | **100** | 67 | glint, nimbus, hubris, marble |
| `8vchn6ea3y6miec` | 🪿 goose | × | tinyduck | YES | 38 | 41 | 72 | 36 | **100** | lilt, tallow, bramble, loam |
| `52i1vmafmjqdksy` | 🐢 turtle | · | beanie | YES | 51 | 50 | 42 | 83 | **100** | omen, hubris, jostle, quip |
| `78f3g4chcn62r4x` | 🐉 dragon | ° | wizard | YES | 70 | 59 | 75 | **100** | **100** | flint, ember, spindle, nacre |
| `28x-tuqqpo0_gm5` | 🐾 chonk | ° | halo | YES | 21 | 92 | 76 | 40 | **100** | nimbus, spindle, loam, pickle |
| `dvs_2xrb90i9hf7` | 🐱 cat | · | none | YES | 32 | 24 | **100** | 77 | **100** | tuft, vellum, zenith, epoch |
| `367kp_nmblvhlgs` | 🐧 penguin | ° | none | YES | 83 | 66 | **100** | 64 | 55 | moss, obelisk, yew, wisp |
| `81z6o666xmavv-v` | 👻 ghost | · | tinyduck | YES | 51 | **80** | 23 | 76 | 57 | crag, dregs, glint, kettle |
| `yrkkxvhqt7hwrv3` | 🦫 capybara | ◉ | wizard | YES | 37 | **100** | 68 | **100** | 39 | nimbus, waffle, rook, wobble |
| `gbob-ai9ue9xbf9` | 🐢 turtle | ° | none | YES | 30 | **100** | **100** | 66 | 60 | bane, silt, thunder, yoke |
| `pu0mjzr69uk2ld_` | 🐌 snail | ✦ | crown | YES | 28 | 54 | 79 | 89 | **100** | umber, sable, ripple, spindle |
| `c40el-6o3lyy15e` | 🐢 turtle | · | propeller | YES | 66 | 78 | 46 | 77 | **79** | brogue, lumen, jamb, quartz |
| `vqa-3517p3hz5b9` | 🪿 goose | · | propeller | YES | 59 | 62 | **100** | 23 | 89 | thorn, yawn, crag, jamb |
| `l0ila-l9myjia5k` | 🍄 mushroom | ✦ | halo | YES | 95 | 22 | **100** | 56 | 25 | hive, etch, lattice, zest |
| `wk93yll8yt21hsw` | 🌵 cactus | ◉ | beanie | YES | 41 | 95 | 27 | **100** | 43 | bane, flint, rind, bristle |
| `7nxh8j_uqcykrb8` | 🐧 penguin | × | halo | YES | **96** | 33 | 40 | 94 | 74 | loam, nuzzle, nook, silt |
| `vk8y2q-wgx3kk17` | 🐰 rabbit | · | beanie | YES | 33 | **100** | **100** | 28 | 37 | hubris, thunder, nape, husk |
| `hwoww34i1-_24hj` | 🐱 cat | · | crown | YES | 68 | **100** | 86 | 26 | 24 | spindle, jetsam, quorum, fathom |
| `bthc3kp59z1n6b9` | 🦆 duck | @ | propeller | YES | 58 | 92 | 38 | **100** | 56 | gambit, clove, dapple, glint |
| `qai18xmdd3elhj3` | 🦆 duck | @ | beanie | YES | 75 | 49 | 67 | **94** | 31 | accordion, sprocket, etch, void |
| `h_g4d1awb3pufi7` | 🦎 axolotl | ° | tophat | YES | 60 | 73 | 93 | **100** | 63 | silt, hearth, huddle, dirge |
| `icgqfnryc3gcq23` | 🐌 snail | × | wizard | YES | 64 | 26 | 27 | 72 | **100** | jade, yawn, urchin, keel |
| `nbdorny9fi9v02i` | 🦎 axolotl | ° | none | YES | 40 | 42 | 98 | 60 | **100** | umbra, vex, clove, yonder |
| `hp9s4nhi4tjv2oi` | 🫧 blob | @ | tophat | YES | **100** | 88 | 50 | 73 | 65 | omen, inkwell, muse, sable |
| `58ff0ixcx4opgg1` | 🌵 cactus | × | propeller | YES | 30 | **100** | 51 | 87 | 62 | dregs, crag, parsnip, flint |
| `1rme0ov4ketdzp0` | 👻 ghost | · | wizard | YES | 21 | **100** | **100** | 57 | 27 | cobble, dross, epoch, fern |
| `vdln21g6ndjpykb` | 🦉 owl | ✦ | halo | YES | 77 | 38 | 79 | **100** | 40 | mantle, verve, whisper, honey |
| `anol3kuw0poanog` | 🐉 dragon | ° | tinyduck | YES | 25 | 21 | **100** | **100** | 78 | muse, lumen, fathom, nape |
| `xeszl_kzzddd68k` | 🤖 robot | ◉ | tophat | YES | 29 | 46 | **100** | **100** | 63 | flume, wisp, hive, mote |
| `p4wqb-bzvbfyahx` | 🐱 cat | × | wizard | YES | 56 | 82 | **100** | 49 | 23 | kiln, flume, wisp, vortex |
| `-r6t88_lwpq0ku_` | 🐰 rabbit | · | halo | YES | **93** | 87 | 28 | 69 | 74 | huddle, vortex, kiln, sprocket |
| `hy3dq179za2a8b9` | 🦆 duck | × | beanie | YES | **90** | 76 | 22 | 37 | 61 | crumb, quip, copper, static |
| `zh7-p2l3dbmelte` | 🐌 snail | ✦ | beanie | YES | 84 | **100** | 60 | 49 | 53 | brine, epoch, trellis, urge |
| `w605sk0anajviln` | 🐌 snail | ◉ | tophat | YES | 30 | 46 | **98** | 59 | 80 | dirge, urchin, nacre, murmur |
| `rjbwxhhc19y-zrp` | 🦆 duck | · | tophat | YES | 27 | 83 | 48 | 24 | **99** | muse, quiver, jetsam, apex |
| `k09msfja_qs9zk2` | 🍄 mushroom | × | wizard | YES | **100** | 79 | 48 | 66 | **100** | quorum, rust, static, copper |
| `w-5v0iqnljjiw6v` | 🦉 owl | ✦ | beanie | YES | 43 | **100** | 79 | **100** | 47 | hubris, honey, kiln, bauble |
| `e8gmwkt2nq4w-_m` | 👻 ghost | × | tophat | YES | 42 | 55 | 77 | **100** | 96 | moss, quartz, nook, silt |
| `z3uzxcp-4y6c7kc` | 🦎 axolotl | × | crown | YES | 79 | 79 | **100** | **100** | 31 | apex, vortex, glint, prong |
| `eierw7b5bn49azx` | 🍄 mushroom | @ | crown | YES | 27 | 51 | **100** | 25 | 95 | etch, parsnip, lilt, marble |
| `687fjdhsc6b151t` | 🦉 owl | @ | none | YES | 64 | **100** | 40 | 51 | **100** | dirge, soup, jostle, mirth |
| `38ps-_77g8-5d5w` | 🌵 cactus | ° | beanie | YES | 46 | 66 | **100** | 68 | **100** | umbra, muse, epoch, hive |
| `84pqg0q-tbnn_nw` | 🐧 penguin | ✦ | wizard | YES | **100** | 53 | 64 | **100** | 35 | tallow, bristle, clatter, warble |
| `f-p83du1duh4qlj` | 🐱 cat | × | beanie | YES | 40 | **100** | 71 | 57 | 32 | clove, trellis, soup, gambit |
| `37rnl1ntx3l53fv` | 🐾 chonk | ◉ | wizard | YES | 67 | 42 | 54 | 96 | **100** | wicker, wisp, dross, huddle |
| `6lqzjeorb6oaz7w` | 🌵 cactus | ✦ | beanie | YES | 68 | 99 | **100** | 45 | 20 | yarn, zenith, quip, rune |
| `an_m06bq1ird27q` | 🪿 goose | ◉ | tinyduck | YES | 34 | 45 | **100** | 43 | 92 | marble, apex, lattice, ingot |
| `3s58p6-e-b260y-` | 🐱 cat | @ | tinyduck | YES | 32 | 56 | 76 | **100** | 62 | ingot, rook, warble, brine |
| `mdpr9ip6fcj253z` | 🪿 goose | @ | beanie | YES | 64 | 76 | **100** | 94 | 74 | hive, alcove, pebble, eave |

### Legendary by Species

#### 🐉 DRAGON (303 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `p-o689716nq1d_g` SHINY | ◉ | tophat | **100** | 39 | 50 | 65 | 77 |
| `gm8rtp_2mm0gmru` SHINY | @ | halo | 74 | 47 | **96** | **100** | 67 |
| `78f3g4chcn62r4x` SHINY | ° | wizard | 70 | 59 | 75 | **100** | **100** |
| `anol3kuw0poanog` SHINY | ° | tinyduck | 25 | 21 | **100** | **100** | 78 |
| `friend-2026-aip` | × | beanie | 82 | 26 | 45 | 77 | **100** |
| `friend-2026-imm` | ◉ | beanie | 22 | **99** | **100** | 34 | 69 |

#### 👻 GHOST (328 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `wy03n23mlejgddu` SHINY | × | none | 44 | **100** | **100** | 68 | 36 |
| `1rme0ov4ketdzp0` SHINY | · | wizard | 21 | **100** | **100** | 57 | 27 |
| `e8gmwkt2nq4w-_m` SHINY | × | tophat | 42 | 55 | 77 | **100** | **96** |
| `81z6o666xmavv-v` SHINY | · | tinyduck | 51 | 80 | 23 | 76 | 57 |
| `friend-2026-agk` | · | beanie | **100** | **100** | 56 | 50 | 33 |
| `friend-2026-cm0` | × | halo | 54 | **100** | **100** | 26 | 28 |

#### 🦎 AXOLOTL (315 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `h_g4d1awb3pufi7` SHINY | ° | tophat | 60 | 73 | **93** | **100** | 63 |
| `nbdorny9fi9v02i` SHINY | ° | none | 40 | 42 | **98** | 60 | **100** |
| `z3uzxcp-4y6c7kc` SHINY | × | crown | 79 | 79 | **100** | **100** | 31 |
| `friend-2026-a2h` | ✦ | tinyduck | 83 | 68 | 22 | **100** | 74 |
| `friend-2026-a4c` | ° | crown | 32 | **100** | 22 | 76 | 30 |
| `friend-2026-guj` | @ | propeller | **100** | 57 | 38 | 41 | **100** |

#### 🐱 CAT (295 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `dvs_2xrb90i9hf7` SHINY | · | none | 32 | 24 | **100** | 77 | **100** |
| `hwoww34i1-_24hj` SHINY | · | crown | 68 | **100** | 86 | 26 | 24 |
| `p4wqb-bzvbfyahx` SHINY | × | wizard | 56 | 82 | **100** | 49 | 23 |
| `f-p83du1duh4qlj` SHINY | × | beanie | 40 | **100** | 71 | 57 | 32 |
| `3s58p6-e-b260y-` SHINY | @ | tinyduck | 32 | 56 | 76 | **100** | 62 |
| `friend-2026-dhz` | ◉ | crown | 44 | 73 | 77 | 80 | **100** |

#### 🦉 OWL (299 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `vdln21g6ndjpykb` SHINY | ✦ | halo | 77 | 38 | 79 | **100** | 40 |
| `w-5v0iqnljjiw6v` SHINY | ✦ | beanie | 43 | **100** | 79 | **100** | 47 |
| `687fjdhsc6b151t` SHINY | @ | none | 64 | **100** | 40 | 51 | **100** |
| `3zq76nq2xh43hgi` SHINY | ° | propeller | 50 | 48 | 88 | **99** | 59 |
| `friend-2026-byk` | ° | none | 41 | **100** | **92** | 50 | 30 |
| `friend-2026-cyr` | ✦ | crown | 33 | 78 | 25 | **100** | 84 |

#### 🦫 CAPYBARA (316 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `friend-2026-dje` SHINY | × | crown | 58 | **94** | **100** | 71 | 23 |
| `o7k4o31v4la2e1g` SHINY | ✦ | beanie | 25 | 72 | **94** | **100** | 35 |
| `llaya92eluc5-hh` SHINY | ° | none | 55 | 39 | **100** | 79 | 63 |
| `yrkkxvhqt7hwrv3` SHINY | ◉ | wizard | 37 | **100** | 68 | **100** | 39 |
| `friend-2026-ao_` SHINY | × | wizard | 74 | 33 | 57 | 44 | **94** |
| `friend-2026-dty` | · | crown | **100** | 70 | 51 | 60 | 48 |

#### 🐾 CHONK (320 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `28x-tuqqpo0_gm5` SHINY | ° | halo | 21 | **92** | 76 | 40 | **100** |
| `37rnl1ntx3l53fv` SHINY | ◉ | wizard | 67 | 42 | 54 | **96** | **100** |
| `friend-2026-8_9` SHINY | ✦ | propeller | 47 | 57 | 77 | 62 | **95** |
| `friend-2026-akv` | @ | halo | 34 | 55 | 62 | **100** | 75 |
| `friend-2026-csv` | ° | tophat | 57 | 40 | **100** | 68 | **98** |
| `friend-2026-c8v` | @ | propeller | 77 | 35 | 74 | **100** | **100** |

#### 🐙 OCTOPUS (326 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `5f3rk-56k-qgsk7` SHINY | · | tophat | 41 | 84 | 54 | 85 | 69 |
| `friend-2026-c6y` | × | crown | 74 | **100** | 54 | 67 | 24 |
| `friend-2026-hvk` | ◉ | wizard | **91** | **100** | 62 | 75 | 30 |
| `friend-2026-hz4` | ◉ | tophat | **100** | 37 | **93** | 70 | 29 |
| `friend-2026-jk_` | ◉ | tinyduck | 74 | 76 | 24 | 66 | **100** |
| `friend-2026-kff` | ◉ | propeller | 44 | 65 | **100** | 77 | 62 |

#### 🐧 PENGUIN (326 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `34mwvut5c_1aaoq` SHINY | @ | halo | **94** | **100** | 76 | 46 | 68 |
| `4u5ag7x1xw1b492` SHINY | @ | tinyduck | 75 | **100** | 77 | 40 | 60 |
| `4d8i07hpbcwukvz` SHINY | × | tinyduck | 75 | 65 | 59 | **100** | **92** |
| `367kp_nmblvhlgs` SHINY | ° | none | 83 | 66 | **100** | 64 | 55 |
| `84pqg0q-tbnn_nw` SHINY | ✦ | wizard | **100** | 53 | 64 | **100** | 35 |
| `7nxh8j_uqcykrb8` SHINY | × | halo | **96** | 33 | 40 | **94** | 74 |

#### 🦆 DUCK (307 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `9va01agxvztzub5` SHINY | ✦ | tinyduck | 35 | 80 | **100** | 29 | 67 |
| `bthc3kp59z1n6b9` SHINY | @ | propeller | 58 | **92** | 38 | **100** | 56 |
| `rjbwxhhc19y-zrp` SHINY | · | tophat | 27 | 83 | 48 | 24 | **99** |
| `friend-2026-hdp` SHINY | ◉ | beanie | 78 | 23 | **97** | 79 | 23 |
| `qai18xmdd3elhj3` SHINY | @ | beanie | 75 | 49 | 67 | **94** | 31 |
| `hy3dq179za2a8b9` SHINY | × | beanie | **90** | 76 | 22 | 37 | 61 |

#### 🐰 RABBIT (314 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `gsusmcu27heajah` SHINY | · | crown | 36 | **100** | 67 | 45 | **91** |
| `vk8y2q-wgx3kk17` SHINY | · | beanie | 33 | **100** | **100** | 28 | 37 |
| `-r6t88_lwpq0ku_` SHINY | · | halo | **93** | 87 | 28 | 69 | 74 |
| `friend-2026-bot` | × | beanie | 30 | 50 | **100** | 72 | **100** |
| `friend-2026-b3j` | @ | wizard | 66 | 41 | **100** | 58 | **100** |
| `friend-2026-cj1` | × | tophat | 53 | **100** | 32 | **100** | 32 |

#### 🍄 MUSHROOM (306 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `l0ila-l9myjia5k` SHINY | ✦ | halo | **95** | 22 | **100** | 56 | 25 |
| `k09msfja_qs9zk2` SHINY | × | wizard | **100** | 79 | 48 | 66 | **100** |
| `eierw7b5bn49azx` SHINY | @ | crown | 27 | 51 | **100** | 25 | **95** |
| `friend-2026-9e9` SHINY | × | beanie | 74 | 43 | 22 | 79 | **95** |
| `friend-2026-c8m` | ° | crown | 21 | **100** | 51 | 61 | 85 |
| `friend-2026-drm` | ✦ | beanie | **100** | 31 | 21 | 74 | 24 |

#### 🐢 TURTLE (297 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `a596b07y1be-hkn` SHINY | @ | tophat | **100** | 30 | 83 | 41 | 60 |
| `52i1vmafmjqdksy` SHINY | · | beanie | 51 | 50 | 42 | 83 | **100** |
| `gbob-ai9ue9xbf9` SHINY | ° | none | 30 | **100** | **100** | 66 | 60 |
| `1ol4a2jx6_jtcix` SHINY | ° | tophat | 84 | 53 | 25 | **96** | 69 |
| `c40el-6o3lyy15e` SHINY | · | propeller | 66 | 78 | 46 | 77 | 79 |
| `friend-2026-a57` | · | none | 87 | 45 | **100** | 31 | 39 |

#### 🫧 BLOB (310 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `hp9s4nhi4tjv2oi` SHINY | @ | tophat | **100** | 88 | 50 | 73 | 65 |
| `friend-2026-ad5` | ° | propeller | 65 | 70 | **100** | 63 | 35 |
| `friend-2026-brx` | @ | halo | 60 | **100** | 32 | 42 | 83 |
| `friend-2026-f0b` | ✦ | tophat | 49 | 40 | 48 | 75 | **100** |
| `friend-2026-gko` | @ | crown | 40 | **97** | 33 | 53 | **100** |
| `friend-2026-gty` | @ | none | 23 | 69 | **94** | 21 | **100** |

#### 🤖 ROBOT (285 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `2kbi9_ydg13wx9j` SHINY | @ | tophat | **100** | 32 | **100** | 53 | 41 |
| `xeszl_kzzddd68k` SHINY | ◉ | tophat | 29 | 46 | **100** | **100** | 63 |
| `iimx0q-29hq1g7i` SHINY | @ | crown | 74 | 61 | **98** | 79 | 40 |
| `friend-2026-cxa` | ◉ | crown | **100** | 36 | 59 | 68 | 84 |
| `friend-2026-e7l` | · | wizard | **100** | 80 | 23 | 42 | 69 |
| `friend-2026-ff7` | ✦ | beanie | 70 | 50 | 77 | **100** | 43 |

#### 🐌 SNAIL (333 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `pu0mjzr69uk2ld_` SHINY | ✦ | crown | 28 | 54 | 79 | 89 | **100** |
| `icgqfnryc3gcq23` SHINY | × | wizard | 64 | 26 | 27 | 72 | **100** |
| `zh7-p2l3dbmelte` SHINY | ✦ | beanie | 84 | **100** | 60 | 49 | 53 |
| `w605sk0anajviln` SHINY | ◉ | tophat | 30 | 46 | **98** | 59 | 80 |
| `friend-2026-a1q` | × | none | **100** | 35 | 72 | 71 | **100** |
| `friend-2026-bfr` | @ | crown | 76 | 30 | 75 | 75 | **100** |

#### 🌵 CACTUS (296 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `utl5fl81r525r12` SHINY | · | halo | 72 | **100** | **100** | 20 | 64 |
| `wk93yll8yt21hsw` SHINY | ◉ | beanie | 41 | **95** | 27 | **100** | 43 |
| `58ff0ixcx4opgg1` SHINY | × | propeller | 30 | **100** | 51 | 87 | 62 |
| `38ps-_77g8-5d5w` SHINY | ° | beanie | 46 | 66 | **100** | 68 | **100** |
| `6lqzjeorb6oaz7w` SHINY | ✦ | beanie | 68 | **99** | **100** | 45 | 20 |
| `bwb3j5it882k7o9` SHINY | ◉ | tophat | **97** | 62 | 54 | 81 | 45 |

#### 🪿 GOOSE (302 found)

| Salt | Eye | Hat | DEB | PAT | CHA | WIS | SNK |
|------|-----|-----|-----|-----|-----|-----|-----|
| `l_ehc6vaz9yr77g` SHINY | ◉ | none | 47 | 85 | **100** | 51 | 63 |
| `8vchn6ea3y6miec` SHINY | × | tinyduck | 38 | 41 | 72 | 36 | **100** |
| `vqa-3517p3hz5b9` SHINY | · | propeller | 59 | 62 | **100** | 23 | 89 |
| `an_m06bq1ird27q` SHINY | ◉ | tinyduck | 34 | 45 | **100** | 43 | **92** |
| `mdpr9ip6fcj253z` SHINY | @ | beanie | 64 | 76 | **100** | **94** | 74 |
| `friend-2026-ex1` | ° | crown | 43 | 46 | **100** | 29 | **92** |

### Original (未 patch) 結果

| Salt | Rarity | Species | Eye | Hat | Shiny | DEB | PAT | CHA | WIS | SNK |
|------|--------|---------|-----|-----|-------|-----|-----|-----|-----|-----|
| `friend-2026-401` | common | 🐌 snail | ◉ | none | false | 61 | 78 | 78 | 65 | 45 |
