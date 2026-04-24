import json
from pathlib import Path

json_path = Path("neet_examside_data_mapped_v6.json")
with open(json_path, "r", encoding="utf-8") as f:
    qbank = json.load(f)

chapters = set()
for q in qbank:
    chapters.add(q.get("chapter"))

print(f"Total questions: {len(qbank)}")
print(f"Total chapters: {len(chapters)}")

# Check for "Waves and Sound"
print("\nChecking for 'Waves and Sound' variations:")
target = "Waves and Sound"
found = [c for c in chapters if c and target.lower() in c.lower()]
print(f"Found matches: {found}")

# Check count for a specific one
for f in found:
    count = len([q for q in qbank if q.get("chapter") == f])
    print(f"Chapter '{f}': {count} questions")
