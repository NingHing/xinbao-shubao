---
version: alpha
name: 并记
description: 两人一本私密日记。版式借 Airbnb 的照片优先、大圆角、单色点缀、克制字重；颜色和字体锁在并记纸色板上。不是 Airbnb 克隆，不使用 Rausch 珊瑚红、Cereal 字体或 Bélo 标志。
source: Airbnb DESIGN.md spatial language, remapped for 并记

colors:
  primary: "#3D5A5B"
  primary-active: "#2F4748"
  primary-disabled: "#C4D0D0"
  ink: "#2C2620"
  body: "#4A4038"
  muted: "#7A7064"
  muted-soft: "#8A7D72"
  canvas: "#D8CFC0"
  canvas-soft: "#E5DCCF"
  panel: "#F7F1E6"
  surface-card: "#FAF6EE"
  hairline: "rgba(44, 38, 32, 0.14)"
  on-primary: "#FAF6EE"
  blush: "#B9A898"
  sky: "#6E8586"
  gold: "#9A8668"
  warm: "#C4A574"
  scrim: "#2C2620"

typography:
  display-xl:
    fontFamily: '"Songti SC", "STSong", "Noto Serif SC", serif'
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.3
  display-lg:
    fontFamily: '"Songti SC", "STSong", "Noto Serif SC", serif'
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
  title-md:
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  body-sm:
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: 12px
    fontWeight: 500
    letterSpacing: 0.12em
  button-md:
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: 16px
    fontWeight: 500

rounded:
  sm: 8px
  md: 14px
  lg: 20px
  xl: 24px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 64px
---

## 1. Visual Theme & Atmosphere

并记是私密手帐，不是旅行市场。借 Airbnb 的空间语言：照片承担视觉重量，字不要喊；圆角软；主色只用在少数 CTA；页面大部分是纸面 + 墨色。

气质：温暖、好客、像翻开一本两人的本子。密度中等（卡片可多，留白要够）。动效克制（150–300ms）。

保留并记已有的纸张噪点（`body::before` 全屏颗粒）。Airbnb 原版是纯白无纹理；并记用暖纸底 + 轻噪点，不要做成玻璃拟态或深色 OLED。

## 2. Color Palette & Roles

只使用 `styles.css` `:root` 里已有的色。不要引入 Airbnb Rausch `#FF385C`。

| Role | Hex | 用途 |
|------|-----|------|
| Canvas | `#D8CFC0` | 桌面 / 页面底 |
| Panel | `#F7F1E6` | 门禁卡、抽屉、大面板 |
| Card | `#FAF6EE` | 条目卡、照片卡 |
| Ink | `#2C2620` | 标题、主文、选中态 |
| Muted | `#7A7064` | 次文、日期、说明 |
| Primary | `#3D5A5B` | 唯一主 CTA、关键点缀（少用） |
| Primary active | `#2F4748` | CTA 按下 |
| On primary | `#FAF6EE` | 主按钮上的字 |
| Hairline | `rgba(44,38,32,0.14)` | 分割线、描边 |
| Blush / Sky / Gold | `#B9A898` / `#6E8586` / `#9A8668` | 五个入口分色，不当第二品牌色 |

主色原则（Airbnb 同款纪律）：一页里主色只出现 1–2 次（保存、登录、搜索圆钮）。其余用墨色文字 + 纸面。

## 3. Typography Rules

国内手机不加载 Google Fonts，也不加载 Airbnb Cereal。

- 标题 / 产品名：宋体 `Songti SC`（门禁「并记」、Hero）
- 正文 / 按钮 / 卡片标题：系统黑体 `PingFang SC`
- 字重克制：标题 500–600，正文 400。不要用 800/900 大黑
- 首页主标题约 28–32px 即可；视觉重量交给照片和圆形入口，不靠巨大标题
- 足迹详情里「日期 / 地点」可以略大，但不要做成 64px 评分墙（那是 Airbnb listing 的信任信号，并记不需要）

## 4. Component Stylings

### Buttons

- 主按钮：`#3D5A5B` 底、纸色字、高度 48px、圆角 8–999px（整页统一一种：表单里 8px，首页/胶囊动作用 `rounded.full`）
- 次按钮：纸面 + 墨色描边，无填充强调
- 文字按钮：墨色，无底，hover 才下划线
- 按下：换 `primary-active`，不要缩放整页布局

### Photo-first cards（足迹、纪念日配图）

这是最该学 Airbnb 的一块：

- 上图下文。图 1:1 或 4:5，圆角 14–20px 裁切
- 图上可叠小胶囊（地点、置顶），不要大色块遮照片
- 图下 3–5 行元信息：标题（16px/600）→ 日期/距离（14px muted）→ 一句摘录
- 卡片之间间距 16px；不要厚阴影堆叠

### 首页五个入口

可继续用圆形，但按 Airbnb 的「图标 + 短标签 + 选中下划线/实心底」来收：圆形是手帐物件，不是仪表盘磁贴。五个入口用 blush / sky / gold 等分色，饱和度保持莫兰迪。

### Inputs

- 高度 48–56px，圆角 8–18px，1px hairline
- 聚焦：描边变墨色 2px，不要发光 ring、不要主色光晕

### 设置抽屉 / 门禁

- 纸面面板，圆角 20px，一层轻阴影即可
- 门禁以宋体标题为中心，CTA 只有一个主按钮

## 5. Layout Principles

- 间距底数 4 / 8px。区块竖向 48–64px，卡片内边距 16–24px
- 桌面内容宽约 1080–1280px；手机单列
- 上半页更疏（Hero / 新动态），下半页更密（入口、列表）——学 Airbnb「开敞英雄区 + 较密卡片区」
- 足迹列表：手机 1 列，平板 2 列，桌面 3–4 列照片卡

## 6. Depth & Elevation

只有一档阴影，或没有：

```css
box-shadow: rgba(44, 38, 32, 0.04) 0 2px 6px, rgba(44, 38, 32, 0.10) 0 4px 8px;
```

用于：卡片 hover、下拉、门禁卡。页面底、Hero、页脚不加阴影。深度靠照片、纸面分层和圆角，不靠多层 elevation。

保留现有纸张噪点；不要再加玻璃模糊。

## 7. Do's and Don'ts

**Do**

- 照片优先：足迹、纪念日有图时，图比字大
- 圆角软：按钮、卡片、头像、日期格子都是圆的
- 主色稀缺：一页最多一两处 `#3D5A5B`
- 系统字体 + 纸色板
- 触摸目标 ≥ 44px，主按钮 48px

**Don't**

- 不要用 `#FF385C`、Bélo、Cereal、Circular、「Airbnb」字样
- 不要纯白大画布替代暖纸底
- 不要深色模式、霓虹、玻璃拟态、夸张最小主义超大字
- 不要把首页做成房源搜索条（Where / When / Who）
- 不要黄星星评分；并记不是市场
- 不要 Google Fonts 外链

## 8. Responsive Behavior

| 宽度 | 变化 |
|------|------|
| < 744px | 单列；入口上三下二圆；足迹照片卡 1 列；设置用底部/侧抽屉 |
| 744–1128px | 足迹 2 列；入口可弧线或网格 |
| > 1128px | 足迹 3–4 列；内容居中限宽 |

## 9. Agent Prompt Guide

改 UI 前先读本文件和 `styles.css` `:root`。

现成提示词：

- 「按 DESIGN.md 把足迹改成照片优先卡片：上图下文、14–20px 圆角、主色只用在收藏/保存。」
- 「按 DESIGN.md 收首页：照片和圆形入口承担重量，标题用宋体、不要巨大字号，CTA 用鼠尾绿 `#3D5A5B`。」
- 「设置抽屉做成 Airbnb 那种干净纸面面板：一层阴影、48px 按钮、hairline 分割，不要玻璃。」

颜色速查：纸底 `#D8CFC0` · 卡片 `#FAF6EE` · 墨 `#2C2620` · 主色 `#3D5A5B`
