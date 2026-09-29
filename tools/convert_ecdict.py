# -*- coding: utf-8 -*-
"""
convert_ecdict.py — 把 ECDICT 的雅思词表转成本站词库格式

数据源：ECDICT（https://github.com/skywind3000/ECDICT），MIT License
        Copyright (c) 2025 Linwei
        输入文件 _ielts_src/ielts_raw.json（tag 含 ielts 的词条）

产出：
        data/index.json          章节清单
        data/ch/cNN.json         每章词表
        本目录 import-report.txt 转换报告（丢了什么、每章多少词）

章怎么分：ECDICT 没有语义词群，所以按柯林斯星级分章（5 星最高频），
        章内按 COCA 词频从高到低排，每 50 个词切一组。
        书里的 22 章逻辑词群等你的词表到了再加，两套并存。
"""

import io
import os
import re
import json
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(ROOT), '_ielts_src', 'ielts_raw.json')
OUT_INDEX = os.path.join(ROOT, 'data', 'index.json')
OUT_CH = os.path.join(ROOT, 'data', 'ch')
OUT_REPORT = os.path.join(HERE, 'import-report.txt')

CLUSTER_SIZE = 50          # 每组多少个词
CHAPTER_CAP = 600          # 一章最多多少个词，超了就拆上下

# ── 音标：ECDICT 用的是老式编码，映射成标准 IPA 字符 ──────────────────
IPA_MAP = {
    'ә': 'ə',   # ә 西里尔 schwa   -> ə
    'є': 'ɛ',   # є 西里尔         -> ɛ
    'ε': 'e',        # ε 希腊           -> e
    ':': 'ː',        # 半角冒号         -> ː 长音
    "'": 'ˈ',        # 半角撇号         -> ˈ 重音
}

# 词性归一化
POS_MAP = {
    'n.': 'n.', 'a.': 'adj.', 'adj.': 'adj.', 'vt.': 'vt.', 'vi.': 'vi.',
    'v.': 'v.', 'adv.': 'adv.', 'prep.': 'prep.', 'conj.': 'conj.',
    'pron.': 'pron.', 'num.': 'num.', 'abbr.': 'abbr.', 'pl.': 'pl.',
}

POS_RE = re.compile(r'^([a-zA-Z]{1,6}\.)\s*')

# 复数 / 时态变形词条，删掉（背 accident 不用背 accidents）
# 注意 ECDICT 写的是「brochure的名词复数」，中间夹了"名词"，不能只匹配"的复数"
VARIANT_RE = re.compile(r'的(名词|动词|形容词|副词)?(复数|过去式|过去分词|现在分词|'
                        r'第三人称单数|比较级|最高级)')

# ECDICT 自己的脏数据：词条名撞上了缩写，释义跟单词对不上。人工拉黑。
BLACKLIST = {'ohp', 'hats', 'topics'}

STAR_TITLE = {
    5: ('核心必备', 'Core Essentials'),
    4: ('高频词', 'High Frequency'),
    3: ('常用词', 'Common Words'),
    2: ('进阶词', 'Building Blocks'),
    1: ('拓展词', 'Extra Vocabulary'),
    0: ('其他雅思词', 'Other IELTS Words'),
}


def clean_ipa(raw):
    """老式音标 -> 标准 IPA。空的原样返回 None。"""
    s = (raw or '').strip()
    if not s:
        return None
    for a, b in IPA_MAP.items():
        s = s.replace(a, b)
    s = s.strip()
    if s.startswith('/') and s.endswith('/'):
        return s
    return '/' + s.strip('/') + '/'


def first_line(text):
    """ECDICT 把多行释义里的换行存成了字面的反斜杠+n，先还原成真换行再取首行。"""
    s = (text or '').replace('\r', '').replace('\\n', '\n')
    return s.split('\n')[0].strip()


def clean_zh(text):
    """释义首行 -> 中文。去掉词性前缀、领域标记 [经] 之类，半角标点换全角。"""
    first = first_line(text)
    if not first:
        return '', None
    first = POS_RE.sub('', first).strip()          # 去掉开头的 n. / a. 之类
    if first.startswith('['):                      # 整行都是 [经] ... 这种领域行
        return '', None
    first = first.replace(', ', '，').replace(';', '；')
    first = first.replace('...', '…').replace(',', '，')
    first = re.sub(r'\s+', ' ', first).strip().strip('，')
    return first, None


def main():
    if not os.path.exists(SRC):
        raise SystemExit('找不到输入：' + SRC)

    rows = json.load(io.open(SRC, encoding='utf-8'))
    report = []
    report.append('ECDICT 雅思词转换报告')
    report.append('=' * 46)
    report.append('输入：%s' % SRC)
    report.append('原始词条：%d' % len(rows))
    report.append('')

    kept = {}
    drop = collections.Counter()

    for r in rows:
        w = (r.get('word') or '').strip()
        if not w:
            drop['空词条'] += 1
            continue

        if w.lower() in BLACKLIST:
            drop['脏数据（人工拉黑）'] += 1
            continue

        # 变形词要拿整段释义判断，有的标记不在首行
        full = (r.get('translation') or '').replace('\\n', '\n')
        if VARIANT_RE.search(full):
            drop['变形词（复数时态等）'] += 1
            continue

        zh, _ = clean_zh(r.get('translation'))
        if not zh:
            drop['没有中文释义'] += 1
            continue

        m = POS_RE.match(first_line(r.get('translation')))
        pos = POS_MAP.get(m.group(1).lower()) if m else None

        collins = 0
        try:
            collins = int((r.get('collins') or '0').strip() or 0)
        except ValueError:
            collins = 0
        collins = max(0, min(5, collins))

        def num(k):
            try:
                return int((r.get(k) or '0').strip() or 0)
            except ValueError:
                return 0

        frq, bnc = num('frq'), num('bnc')

        # exchange 里是词形变化：p:过去式/d:过去分词/i:现在分词/3:三单/s:复数/r:比较级/t:最高级
        forms = [w]
        for part in (r.get('exchange') or '').split('/'):
            if ':' in part:
                v = part.split(':', 1)[1].strip()
                if v and v.lower() not in (x.lower() for x in forms):
                    forms.append(v)

        entry = {
            'w': w,
            'ipa': clean_ipa(r.get('phonetic')),
            'pos': pos,
            'zh': zh,
            'collins': collins,
            'frq': frq if frq > 0 else 999999,
            'bnc': bnc if bnc > 0 else 999999,
            'forms': forms,
        }

        key = w.lower()
        old = kept.get(key)
        if old is None:
            kept[key] = entry
        else:
            drop['重复词'] += 1
            # 留"料更足"的那条：柯林斯星级高优先，再比音标
            if (entry['collins'], bool(entry['ipa'])) > (old['collins'], bool(old['ipa'])):
                kept[key] = entry

    report.append('保留 %d 词，丢掉：' % len(kept))
    for k, v in drop.most_common():
        report.append('   %-22s %d' % (k, v))
    report.append('')

    # ── 分章：先按柯林斯星级，星级内按词频排 ──────────────────────────
    by_star = collections.defaultdict(list)
    for e in kept.values():
        by_star[e['collins']].append(e)
    for s in by_star:
        by_star[s].sort(key=lambda e: (e['frq'], e['w'].lower()))

    chapters = []
    n_ch = 0
    for star in (5, 4, 3, 2, 1, 0):
        pool = by_star.get(star) or []
        if not pool:
            continue
        parts = max(1, -(-len(pool) // CHAPTER_CAP))     # 向上取整
        # 均分，别让最后一章只剩几个词
        base, extra = divmod(len(pool), parts)
        title, title_en = STAR_TITLE[star]
        cursor = 0
        for i in range(parts):
            size = base + (1 if i < extra else 0)
            chunk = pool[cursor:cursor + size]
            cursor += size
            n_ch += 1
            cid = 'c%02d' % n_ch
            if parts > 1:
                suffix = ('上', '中', '下')[i] if parts == 3 else ('上', '下')[i]
                c_title = '%s · %s' % (title, suffix)
            else:
                c_title = title

            clusters = []
            for gi in range(0, len(chunk), CLUSTER_SIZE):
                grp = chunk[gi:gi + CLUSTER_SIZE]
                clusters.append({
                    'id': '%s-g%d' % (cid, gi // CLUSTER_SIZE + 1),
                    'name': '第 %d 组' % (gi // CLUSTER_SIZE + 1),
                    'words': [{
                        'w': e['w'],
                        'ipa': e['ipa'],
                        'pos': e['pos'],
                        'zh': e['zh'],
                        'ex': None,
                        'exZh': None,
                        'syn': [],
                    } for e in grp],
                })

            doc = {
                'id': cid,
                'n': n_ch,
                'title': c_title,
                'titleEn': title_en,
                'source': 'ECDICT (MIT)',
                'clusters': clusters,
            }
            io.open(os.path.join(OUT_CH, cid + '.json'), 'w',
                    encoding='utf-8').write(
                json.dumps(doc, ensure_ascii=False, indent=1))

            chapters.append({
                'id': cid, 'n': n_ch, 'title': c_title,
                'titleEn': title_en, 'count': len(chunk),
            })
            report.append('%-6s %-18s %5d 词  %2d 组' % (
                cid, c_title, len(chunk), len(clusters)))

    index = {
        'dataVersion': 2,
        'source': 'ECDICT (MIT License, Copyright (c) 2025 Linwei)',
        'note': ('词表来自开源词库 ECDICT 的雅思标签词，'
                 '按柯林斯星级分章、章内按词频排。'
                 '例句待 Tatoeba 回填。'),
        'chapters': chapters,
    }
    io.open(OUT_INDEX, 'w', encoding='utf-8').write(
        json.dumps(index, ensure_ascii=False, indent=2))

    # 顺带导一份词形表，给例句匹配用（认 abandoned / abandoned 这种变形）
    forms_out = {e['w']: e['forms'] for e in kept.values()}
    io.open(os.path.join(os.path.dirname(ROOT), '_ielts_src', 'word_forms.json'),
            'w', encoding='utf-8').write(
        json.dumps(forms_out, ensure_ascii=False))
    report.append('')
    report.append('词形表 %d 词，写到 _ielts_src/word_forms.json' % len(forms_out))

    report.append('')
    report.append('合计 %d 章 / %d 词' % (len(chapters), sum(c['count'] for c in chapters)))
    io.open(OUT_REPORT, 'w', encoding='utf-8').write('\n'.join(report))
    print('ok chapters=%d words=%d' % (len(chapters), sum(c['count'] for c in chapters)))


if __name__ == '__main__':
    main()
