# -*- coding: utf-8 -*-
"""
apply_examples.py — 把 Tatoeba 例句灌进词库

读 _ielts_src/examples.json（fetch_examples.py 的产出），
按单词逐个填进 data/ch/*.json 的 ex / exZh 两个字段。
没配到例句的词保持 null，界面会自动不显示例句区，不会渲染出空框。

跑完输出 example-report.txt 的补全部分，看覆盖率。
"""

import io
import os
import json
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EX = os.path.join(os.path.dirname(ROOT), '_ielts_src', 'examples.json')
REPORT = os.path.join(HERE, 'example-report.txt')


def main():
    if not os.path.exists(EX):
        raise SystemExit('找不到 ' + EX + '，先跑 fetch_examples.py')

    examples = json.load(io.open(EX, encoding='utf-8'))
    # 大小写不敏感匹配，书的词表以后大小写可能不一样
    lookup = {k.lower(): v for k, v in examples.items()}

    total = filled = 0
    lines = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'ch', '*.json'))):
        d = json.load(io.open(p, encoding='utf-8'))
        c_fill = 0
        for c in d['clusters']:
            for w in c['words']:
                total += 1
                hit = lookup.get(w['w'].lower())
                if hit:
                    w['ex'] = hit['ex']
                    w['exZh'] = hit['exZh']
                    filled += 1
                    c_fill += 1
        io.open(p, 'w', encoding='utf-8').write(
            json.dumps(d, ensure_ascii=False, indent=1))
        lines.append('  %-6s %-18s 填了 %d / %d' % (
            d['id'], d['title'], c_fill, sum(len(c['words']) for c in d['clusters'])))

    head = [
        '例句补全报告',
        '=' * 46,
        '词表总数 %d，配上例句 %d（%.1f%%）' % (
            total, filled, 100.0 * filled / max(1, total)),
        '没配上的 %d 个词，界面上不会显示例句区。' % (total - filled),
        '',
    ]
    io.open(REPORT, 'w', encoding='utf-8').write(
        '\n'.join(head + lines) + '\n\n出处：Tatoeba (https://tatoeba.org)，例句 CC-BY 2.0 FR\n')
    print('ok filled=%d/%d' % (filled, total))


if __name__ == '__main__':
    main()
