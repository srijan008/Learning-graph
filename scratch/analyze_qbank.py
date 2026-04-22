import json

with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

subjects = {}
for q in data:
    sub = q.get('subject', 'unknown')
    if sub not in subjects:
        subjects[sub] = set()
    subjects[sub].add(q.get('chapter', 'unknown'))

for sub, chapters in subjects.items():
    sample = list(chapters)[:3]
    print(f"{sub}: {len(chapters)} chapters, sample: {sample}")

print(f"Total questions: {len(data)}")
print("Keys:", list(data[0].keys()))
print("Sample URL:", data[0]['url'][:80])
