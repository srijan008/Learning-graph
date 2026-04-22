import json
with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for q in data:
    expl = q.get('explanation', '')
    if 'Comparing equation (i) and equation (ii)' in expl:
        print('--- EXPLANATION START ---')
        print(expl)
        print('--- EXPLANATION END ---')
        break

