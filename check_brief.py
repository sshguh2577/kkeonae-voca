#!/usr/bin/env python3
"""꺼내보카 '아침 영어' 파일(brief.json) 검사.

쓰는 법: python3 check_brief.py brief.json
통과하면 'OK'와 요약을 찍고 0으로 끝난다. 하나라도 어긋나면 무엇이 틀렸는지 찍고 1로 끝난다.
앱(app.js)도 같은 규칙으로 읽는다. 규칙을 바꾸면 앱 쪽 briefDayOk()도 같이 바꾼다.
"""
import datetime
import json
import re
import sys

CATS = ['finance', 'civil', 'world']
HANGUL = re.compile(r'[가-힣]')
MAX_BYTES = 200 * 1024


def words_of(s):
    return re.findall(r"[A-Za-z][A-Za-z'’\-]*", s)


def check(path):
    errs, warns = [], []
    raw = open(path, 'rb').read()
    if len(raw) > MAX_BYTES:
        errs.append('파일이 너무 커요 (%d바이트, 최대 %d)' % (len(raw), MAX_BYTES))
    try:
        o = json.loads(raw.decode('utf-8'))
    except Exception as e:  # noqa: BLE001
        return ['JSON으로 읽지 못했어요: %s' % e], warns, None
    if o.get('kind') != 'kkeonae-brief':
        errs.append("kind는 'kkeonae-brief'여야 해요")
    if o.get('version') != 1:
        errs.append('version은 1이어야 해요')
    if not isinstance(o.get('updated'), str) or not o['updated']:
        errs.append('updated(올린 때, ISO 문자열)가 없어요')
    days = o.get('days')
    if not isinstance(days, list) or not 1 <= len(days) <= 7:
        errs.append('days는 1~7개인 목록이어야 해요')
        return errs, warns, o
    dates = []
    for di, d in enumerate(days):
        where = 'days[%d]' % di
        date = d.get('date', '')
        try:
            datetime.date.fromisoformat(date)
        except Exception:  # noqa: BLE001
            errs.append('%s: date가 YYYY-MM-DD가 아니에요 (%r)' % (where, date))
        dates.append(date)
        items = d.get('items')
        if not isinstance(items, list) or [x.get('cat') for x in items if isinstance(x, dict)] != CATS:
            errs.append('%s: items는 finance, civil, world 차례로 3개여야 해요' % where)
            continue
        for it in items:
            w2 = '%s %s' % (where, it.get('cat'))
            t = it.get('title', '')
            if not isinstance(t, str) or not t or len(t) > 70 or HANGUL.search(t):
                errs.append('%s: title은 70자 이하 영어여야 해요 (%r)' % (w2, t))
            tk = it.get('titleKo', '')
            if not isinstance(tk, str) or not HANGUL.search(tk) or len(tk) > 40:
                errs.append('%s: titleKo는 40자 이하 한국어여야 해요' % w2)
            en, ko = it.get('en'), it.get('ko')
            if not isinstance(en, list) or not 3 <= len(en) <= 5:
                errs.append('%s: en은 3~5문장 목록이어야 해요' % w2)
                continue
            if not isinstance(ko, list) or len(ko) != len(en):
                errs.append('%s: ko는 en과 문장 수가 같아야 해요' % w2)
                continue
            total = 0
            for si, (e, k) in enumerate(zip(en, ko)):
                if not isinstance(e, str) or not isinstance(k, str):
                    errs.append('%s 문장 %d: 글자가 아니에요' % (w2, si + 1))
                    continue
                n = len(words_of(e))
                total += n
                if HANGUL.search(e):
                    errs.append('%s 문장 %d: 영어 문장에 한글이 있어요' % (w2, si + 1))
                if n < 3 or n > 20 or len(e) > 160:
                    errs.append('%s 문장 %d: 영어 문장은 3~20낱말, 160자 이하로 (%d낱말)' % (w2, si + 1, n))
                if not re.search(r'[.!?]["”’)]?$', e.strip()):
                    errs.append('%s 문장 %d: 영어 문장이 마침표로 끝나지 않아요' % (w2, si + 1))
                if not HANGUL.search(k) or len(k) > 120:
                    errs.append('%s 문장 %d: 한국어 해석이 없거나 너무 길어요' % (w2, si + 1))
            if total / len(en) > 15:
                warns.append('%s: 문장 평균 %.1f낱말 (15 넘으면 초급에게 길어요)' % (w2, total / len(en)))
            low = ' '.join(en).lower()
            ws = it.get('words', [])
            if not isinstance(ws, list) or not 2 <= len(ws) <= 4:
                errs.append('%s: words는 2~4개여야 해요' % w2)
            else:
                for x in ws:
                    w, m = (x or {}).get('w', ''), (x or {}).get('m', '')
                    if not w or not isinstance(w, str) or not HANGUL.search(m or '') or len(m) > 24:
                        errs.append('%s: 단어 %r의 뜻이 없거나 길어요' % (w2, w))
                    elif w.lower()[:max(3, len(w) - 2)] not in low:
                        errs.append('%s: 단어 %r가 영어 문장에 없어요' % (w2, w))
            src = it.get('source') or {}
            if not src.get('name') or not re.match(r'^https://', src.get('url', '')):
                errs.append('%s: source(name, https url)가 없어요' % w2)
        q = d.get('question') or {}
        qe, qk, st = q.get('en', ''), q.get('ko', ''), q.get('starters', [])
        if not qe.strip().endswith('?') or not 3 <= len(words_of(qe)) <= 20:
            errs.append('%s: question.en은 3~20낱말의 물음표로 끝나는 질문이어야 해요' % where)
        if not HANGUL.search(qk):
            errs.append('%s: question.ko가 없어요' % where)
        if not isinstance(st, list) or not 1 <= len(st) <= 3 or any(not isinstance(x, str) or not x for x in st):
            errs.append('%s: question.starters는 1~3개 글이어야 해요' % where)
    if len(set(dates)) != len(dates):
        errs.append('같은 날짜가 두 번 있어요')
    if dates != sorted(dates, reverse=True):
        errs.append('days는 최신 날짜가 앞에 오게 놓아야 해요')
    return errs, warns, o


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    errs, warns, o = check(sys.argv[1])
    for w in warns:
        print('주의:', w)
    if errs:
        for e in errs:
            print('X', e)
        print('실패: %d곳' % len(errs))
        sys.exit(1)
    print('OK: %d일치 (%s)' % (len(o['days']), ', '.join(d['date'] for d in o['days'])))


if __name__ == '__main__':
    main()
