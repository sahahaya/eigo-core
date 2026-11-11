"""教材 JSON の整合性チェック。使い方: python -I tools/check_units.py ."""
import json, os, re, sys

root = sys.argv[1]
idx = json.load(open(os.path.join(root, 'data/index.json'), encoding='utf-8'))
ORDER = ['question', 'core', 'examples', 'quiz', 'speak']
errors, warns = [], []
seen_vocab = {}
seen_ids = set()

def norm(s):
    s = s.lower().replace('’', "'")
    s = re.sub(r"[^a-z0-9' ]+", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

for st in idx['stages']:
    for meta in st['units']:
        if meta['id'] in seen_ids:
            errors.append(f"duplicate unit id {meta['id']}")
        seen_ids.add(meta['id'])
        if not meta.get('file'):
            continue
        path = os.path.join(root, 'data', meta['file'])
        try:
            u = json.load(open(path, encoding='utf-8'))
        except Exception as e:
            errors.append(f"{meta['id']}: JSON error {e}"); continue
        uid = meta['id']
        if u.get('id') != uid: errors.append(f'{uid}: id mismatch')
        types = [s['type'] for s in u['steps']]
        if types != ORDER: errors.append(f'{uid}: step order {types}')
        for s in u['steps']:
            if s['type'] in ('question', 'core') and not s.get('body'): errors.append(f'{uid}: empty body')
            for key in ('body', 'intro'):
                for para in re.split(r'\n\s*\n', s.get(key) or ''):
                    lines = para.split('\n')
                    dash = [l for l in lines if re.match(r'\s*-\s', l)]
                    if dash and len(dash) != len(lines):
                        warns.append(f"{uid}: '- ' list mixed with other lines (renders as raw dashes): {lines[0][:30]}")
            if s['type'] == 'core':
                body = s['body']
                if '[[' not in body: warns.append(f'{uid}: no 日本語/英語 compare block')
                if not re.search(r'(^|\n)>\s', body): warns.append(f'{uid}: no "> " core box in core body')
                if len(s.get('points', [])) < 2: warns.append(f'{uid}: few points')
            if s['type'] == 'examples':
                for ex in s['items']:
                    if not ex.get('en') or not ex.get('ja'): errors.append(f'{uid}: example missing en/ja')
                    # sound はマークアップを解釈しない（そのまま表示される）
                    if '**' in (ex.get('sound') or '') or '`' in (ex.get('sound') or ''):
                        warns.append(f"{uid}: markup in 'sound' is shown as-is: {ex['en'][:30]}")
            if s['type'] == 'quiz':
                ids = [q.get('id') for q in s['items']]
                if None in ids or len(set(ids)) != len(ids): errors.append(f'{uid}: quiz ids missing/duplicate {ids}')
                for q in s['items']:
                    qid = f"{uid}/{q.get('id')}"
                    if not q.get('why'): errors.append(f'{qid}: no why')
                    if not q.get('tag'): errors.append(f'{qid}: no tag')
                    t = q['type']
                    if q.get('audioChoices') and len(q.get('choices', [])) > 4:
                        errors.append(f'{qid}: audioChoices supports up to 4 choices (A-D)')
                    if 'audio' in q and not (isinstance(q['audio'], str) or (isinstance(q['audio'], list) and all(isinstance(x, str) for x in q['audio']))):
                        errors.append(f'{qid}: audio must be a string or a list of strings')
                    if t == 'choice':
                        if not isinstance(q['answer'], int) or not 0 <= q['answer'] < len(q['choices']):
                            errors.append(f'{qid}: bad choice answer')
                        if len(set(q['choices'])) != len(q['choices']): errors.append(f'{qid}: duplicate choices')
                    elif t == 'fill':
                        if q['answer'] not in q['choices']: errors.append(f'{qid}: fill answer not in choices')
                        if q['q'].count('___') != 1: errors.append(f'{qid}: fill needs exactly one ___')
                        if len(set(q['choices'])) != len(q['choices']): errors.append(f'{qid}: duplicate choices')
                    elif t == 'order':
                        if norm(' '.join(q['words'])) != norm(q['answer']):
                            errors.append(f'{qid}: words do not spell answer')
                        if any(re.search(r'[?.!,]', w) for w in q['words']):
                            errors.append(f'{qid}: punctuation inside words')
                        for e in q.get('extra', []):
                            if e in q['words']: errors.append(f'{qid}: extra word duplicates a real word')
                    else:
                        errors.append(f'{qid}: unknown type {t}')
                if len(s['items']) < 6: warns.append(f'{uid}: only {len(s["items"])} quiz items')
            if s['type'] == 'speak':
                for it in s['items']:
                    if not it.get('ja') or not it.get('en'): errors.append(f'{uid}: speak item missing ja/en')
        for v in u.get('vocab', []):
            key = v['en'].lower()
            if key in seen_vocab:
                warns.append(f"{uid}: vocab '{v['en']}' also in {seen_vocab[key]}")
            else:
                seen_vocab[key] = uid
        print(f"{uid}: ok  quiz={sum(len(s['items']) for s in u['steps'] if s['type']=='quiz')} speak={sum(len(s['items']) for s in u['steps'] if s['type']=='speak')} vocab={len(u.get('vocab', []))}")

print('\nERRORS:' if errors else '\nno errors')
for e in errors: print('  ', e)
print('WARNINGS:' if warns else 'no warnings')
for w in warns: print('  ', w)
sys.exit(1 if errors else 0)
