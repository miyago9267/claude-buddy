# claude-buddy

Claude Code `/buddy` 逆向工程工具包 + Roguelike 對戰遊戲。

## 快速開始

```bash
# 玩對戰遊戲
bun buddy-battle.ts

# 生成 pokedex (brute-force 所有 bones 組合)
bun buddy-pokedex.ts

# 驗證 bones 演算法
bun buddy-verify.ts
```

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `buddy-battle.ts` | Roguelike CLI 對戰遊戲 -- 抽卡組隊、10 層推進、回合制戰鬥 |
| `buddy-pokedex.ts` | Pokedex 生成器 -- brute-force salt 收集所有 bones 組合 |
| `buddy-verify.ts` | 演算法驗證工具 -- 確認逆向還原的 PRNG 正確性 |
| `buddy-patch.sh` | Companion 屬性 patch script |
| `buddy-bones-patch.sh` | Bones 屬性 patch script |
| `buddy-presets.json` | 全 18 species 的 legendary shiny preset |
| `claude-buddy-reverse-engineering-report.md` | 完整逆向工程報告 |

## 對戰系統

- **屬性剋制**: 混沌 > 野性 > 秩序 > 混沌
- **Stats**: CHAOS(攻擊) / PATIENCE(防禦+HP) / WISDOM(回復) / SNARK(速度) / DEBUGGING(暴擊)
- **Roguelike**: 寵物 KO 不可復活、敵人 HP 保留、Floor 5/10 BOSS

## 需求

- [Bun](https://bun.sh) runtime
