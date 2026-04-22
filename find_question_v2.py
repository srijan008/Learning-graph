import json
with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for q in data:
    q_text = q.get('question', '')
    if 'organ pipe filled with a gas' in q_text:
        print('--- QUESTION ---')
        print(q_text)
        print('--- EXPLANATION ---')
        print(q.get('explanation', 'NO EXPLANATION'))
        break

