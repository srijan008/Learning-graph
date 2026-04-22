import json
with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for q in data:
    expl = q.get('explanation', '') or ''
    if 'comparing equation (i)' in expl.lower():
        print('--- FOUND ---')
        print('ID:', q.get('id'))
        print('EXP LENGTH:', len(expl))
        print('TEXT:', expl)
        break

