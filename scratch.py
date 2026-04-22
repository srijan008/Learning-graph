import json, re; d = json.load(open('neet_examside_data_mapped_v6.json', encoding='utf-8')); print(len([q for q in d if '\x0c' in q['question']]))
