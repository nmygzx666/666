# 雅思词汇 · 手机背诵站

纯静态网页，给自己背雅思用的。没有后端，进度存在手机本地（localStorage）。
主要用在 iPhone 的 Safari 上，**加到主屏幕**之后进度才不会被清掉。

## 本地怎么看

```
python -m http.server 8080
```

然后浏览器开 `http://localhost:8080`。
**不能直接双击 index.html** —— 朗读和模块加载在 `file://` 下都会坏。

## 现在有什么

- 按章节浏览、单词卡、朗读（浏览器自带 `speechSynthesis`，不用密钥）
- Leitner 五盒间隔重复（0 / 1 / 2 / 4 / 7 / 15 天）
- 打卡、连续天数、错题本、进度导出导入

词库：**11 章 / 4792 词**，按柯林斯星级分章，章内按词频排。

## 词库是怎么来的

按书的章节编（刘洪波《雅思词汇真经》）那套的例句和逻辑词群编排有版权，所以没有扒书，
用的是开源数据源拼出来的：

| 内容 | 来源 | 协议 |
|---|---|---|
| 单词、音标、中文释义 | [ECDICT](https://github.com/skywind3000/ECDICT) | MIT License, Copyright (c) 2025 Linwei |
| 例句（英 + 中） | [Tatoeba](https://tatoeba.org) | CC-BY 2.0 FR |

### 重新生成词库

```
python tools/convert_ecdict.py     # 出词表：data/index.json + data/ch/*.json
python tools/fetch_examples.py     # 从 Tatoeba 抓例句（要先把语料下到 _ielts_src/）
python tools/apply_examples.py     # 把例句灌进词表
```

两个脚本各会出一份报告（`tools/import-report.txt`、`tools/example-report.txt`），
写清楚丢了哪些词、覆盖率多少，跑完看一眼就知道对不对。

`_ielts_src/` 放的是原始语料，几十上百 MB，不进仓库。

### 转换脚本处理过的坑

- ECDICT 的 `translation` 字段里，换行存成的是**字面的反斜杠 + n**，不是真换行，取首行释义前要先还原
- 音标是老式编码：`ә` 其实是西里尔字母 U+04D9（不是 IPA 的 `ə`），长音用冒号、重音用撇号，都得映射
- 变形词（复数、时态）的标记写的是「brochure 的**名词**复数」，只匹配「的复数」会漏掉
- `ohp` / `hats` / `topics` 是词条名撞上缩写的脏数据，已人工拉黑

## 目录

```
index.html              入口
manifest.webmanifest    PWA 清单（加到主屏幕用）
_headers                Cloudflare 缓存规则
css/  js/               样式和逻辑
js/pages/               各个页面
data/index.json         章节清单
data/ch/cNN.json        各章词表（按需加载，不会一次性全下）
tools/                  词库转换脚本
```

## 部署

Cloudflare Pages，连本仓库，**没有构建步骤**：构建命令留空，输出目录填 `/`。
