# -*- coding: utf-8 -*-
"""
fetch_examples.py — 从 Tatoeba 给每个词挑一句带中文翻译的例句

数据源：Tatoeba（https://tatoeba.org），句子 CC-BY 2.0 FR
        需要三份文件放在 _ielts_src/ 下：
            eng_sentences.tsv.bz2   英文句子
            cmn_sentences.tsv.bz2   中文句子
            links.tar.bz2           句子之间的翻译链接

产出：_ielts_src/examples.json   {"word": {"ex": "...", "exZh": "..."}}
      本目录 example-report.txt  覆盖率报告

三步走，每步只留必要的东西在内存里：
    1. 中文句子全读进内存（不大）
    2. 英文句子流式扫一遍，给每个词留 8 条候选
    3. 链接表流式扫一遍，把候选串上中文翻译，挨个试，取第一条有翻译的
"""

import io
import os
import re
import sys
import bz2
import json
import tarfile
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_DIR = os.path.join(os.path.dirname(ROOT), '_ielts_src')

ENG = os.path.join(SRC_DIR, 'eng_sentences.tsv.bz2')
CMN = os.path.join(SRC_DIR, 'cmn_sentences.tsv.bz2')
LINKS = os.path.join(SRC_DIR, 'links.tar.bz2')
FORMS = os.path.join(SRC_DIR, 'word_forms.json')
OUT = os.path.join(SRC_DIR, 'examples.json')
REPORT = os.path.join(HERE, 'example-report.txt')

KEEP_PER_WORD = 8        # 每个词留几条候选，等会儿挨个试有没有中文
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?")


def log(msg):
    sys.stdout.write(msg + '\n')
    sys.stdout.flush()


def tokenize(text):
    """切成小写词元。连字符和撇号都当分隔，所以 mother-in-law 也能匹配到 mother。"""
    out = []
    for t in TOKEN_RE.findall(text):
        out.append(t.lower())
        if "'" in t or '’' in t:          # don't -> don / t 两边都算
            out.extend(x for x in re.split(r"['’]", t) if x)
    return out


def step1_cmn():
    log('[1/4] 读中文句子 ...')
    cmn = {}
    with bz2.open(CMN, 'rt', encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 3:
                cmn[p[0]] = p[2]
    log('      中文句子 %d 条' % len(cmn))
    return cmn


def step2_eng(form2word):
    log('[2/4] 扫英文句子，给每个词挑候选 ...')
    best = collections.defaultdict(list)      # word -> [(score, bytes, sid)]
    n_sent = 0
    with bz2.open(ENG, 'rt', encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 3:
                continue
            sid, text = p[0], p[2]
            n_sent += 1
            if n_sent % 500000 == 0:
                log('      已扫 %d 条' % n_sent)

            toks = tokenize(text)
            n = len(toks)
            if n < 4 or n > 22:               # 太短没上下文，太长手机上放不下
                continue

            seen = set()
            for t in set(toks):
                words = form2word.get(t)
                if not words:
                    continue
                for w in words:
                    if w in seen:
                        continue
                    seen.add(w)
                    # 打分：离 10 个词越近越好，同分取短的，再同取 id 小的（保证可复现）
                    score = (abs(n - 10), len(text), int(sid))
                    lst = best[w]
                    lst.append((score, text, sid))
                    if len(lst) > KEEP_PER_WORD * 3:
                        lst.sort(key=lambda x: x[0])
                        del lst[KEEP_PER_WORD:]
    for w in best:
        best[w].sort(key=lambda x: x[0])
        del best[w][KEEP_PER_WORD:]
    log('      英文句子 %d 条，命中 %d 个词' % (n_sent, len(best)))
    return best


def step3_links(chosen):
    log('[3/4] 扫链接表，配中英对 ...')
    eng2cmn = collections.defaultdict(list)
    n = 0
    with tarfile.open(LINKS, 'r:bz2') as tf:
        member = None
        for m in tf.getmembers():
            if m.name.endswith('links.csv'):
                member = m
                break
        if member is None:
            raise SystemExit('links.tar.bz2 里没找到 links.csv')
        f = tf.extractfile(member)
        for raw in io.TextIOWrapper(f, encoding='utf-8'):
            n += 1
            if n % 5000000 == 0:
                log('      已扫 %d 条链接' % n)
            p = raw.rstrip('\n').split('\t')
            if len(p) < 2:
                continue
            a, b = p[0], p[1]
            if a in chosen:
                eng2cmn[a].append(b)
            if b in chosen:
                eng2cmn[b].append(a)
    log('      链接 %d 条，其中跟候选有关的 %d 条' % (n, sum(len(v) for v in eng2cmn.values())))
    return eng2cmn


def step4_pick(best, eng2cmn, cmn):
    log('[4/4] 挑例句，串中文 ...')
    out = {}
    no_zh = 0
    for w, cands in best.items():
        hit = None
        for _score, text, sid in cands:
            for cid in eng2cmn.get(sid, ()):
                zh = cmn.get(cid)
                if zh and len(zh) <= 60:
                    hit = (text, zh)
                    break
            if hit:
                break
        if hit:
            out[w] = {'ex': hit[0], 'exZh': hit[1]}
        else:
            no_zh += 1
    log('      有例句 %d 词，没配到中文 %d 词' % (len(out), no_zh))
    return out


def main():
    words = json.load(io.open(FORMS, encoding='utf-8'))
    form2word = collections.defaultdict(list)
    for w, forms in words.items():
        for fm in forms:
            fm = fm.lower()
            if w not in form2word[fm]:
                form2word[fm].append(w)
    log('词形表：%d 个词 / %d 种拼法' % (len(words), len(form2word)))

    # 扫语料要好几分钟，中间结果落盘。文件在就直接用，重跑不用重扫。
    cmn_cache = os.path.join(SRC_DIR, '_cmn.json')
    cand_cache = os.path.join(SRC_DIR, '_cand.json')

    if os.path.exists(cmn_cache):
        log('[1/4] 用缓存 ' + cmn_cache)
        cmn = json.load(io.open(cmn_cache, encoding='utf-8'))
    else:
        cmn = step1_cmn()
        json.dump(cmn, io.open(cmn_cache, 'w', encoding='utf-8'), ensure_ascii=False)

    if os.path.exists(cand_cache):
        log('[2/4] 用缓存 ' + cand_cache)
        best = json.load(io.open(cand_cache, encoding='utf-8'))
    else:
        best = step2_eng(form2word)
        json.dump(best, io.open(cand_cache, 'w', encoding='utf-8'), ensure_ascii=False)

    chosen = set()
    for lst in best.values():
        for item in lst:
            chosen.add(item[2])
    eng2cmn = step3_links(chosen)
    out = step4_pick(best, eng2cmn, cmn)

    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))

    lines = ['Tatoeba 例句抓取报告', '=' * 46]
    lines.append('词表总数 %d' % len(words))
    lines.append('拿到例句 %d 词（%.1f%%）' % (len(out), 100.0 * len(out) / max(1, len(words))))
    lines.append('没配到中文翻译的 %d 词' % (len(words) - len(out)))
    lines.append('')
    lines.append('样例 20 条：')
    for i, (w, v) in enumerate(sorted(out.items())):
        if i >= 20:
            break
        lines.append('  %-18s %s' % (w, v['ex']))
        lines.append('  %-18s %s' % ('', v['exZh']))
    lines.append('')
    lines.append('出处：Tatoeba (https://tatoeba.org)，例句 CC-BY 2.0 FR')
    io.open(REPORT, 'w', encoding='utf-8').write('\n'.join(lines))
    log('完成，写到 %s' % OUT)


if __name__ == '__main__':
    main()
