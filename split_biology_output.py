import csv
import os
import uuid

# Configuration
OUTPUT_DIR = r"c:\Users\srija\Desktop\Devlopment\Client-Project\yolearn\learning-graph\output"
SUBJECTS_FILE = os.path.join(OUTPUT_DIR, "neet_subjects.csv")
CHAPTERS_FILE = os.path.join(OUTPUT_DIR, "neet_chapters.csv")

# Botany/Zoology Alignment
MAPPING = {
    "Botany": [
        "Diversity in Living World",
        "Structural Organisation in Plants",
        "Cell Structure and Function",
        "Plant Physiology",
        "Microbes in Human Welfare",
        "Ecology and Environment"
    ],
    "Zoology": [
        "Structural Organisation in Animals",
        "Human Physiology",
        "Reproduction",
        "Genetics and Evolution",
        "Biology and Human Welfare",
        "Biotechnology"
    ]
}

def split_biology():
    # 1. Read existing subjects
    subjects = []
    with open(SUBJECTS_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            subjects.append(row)

    # Find Biology
    biology_id = None
    for s in subjects:
        if s['name'] == 'Biology':
            biology_id = s['id']
            break
    
    if not biology_id:
        print("Error: Biology subject not found.")
        return

    # 2. Assign/Create Botany and Zoology IDs
    botany_id = str(uuid.uuid4())
    zoology_id = str(uuid.uuid4())
    
    new_subjects = subjects.copy()
    new_subjects.append({'id': botany_id, 'name': 'Botany', 'goal_id': ''})
    new_subjects.append({'id': zoology_id, 'name': 'Zoology', 'goal_id': ''})

    # 3. Read chapters and update mapping
    updated_chapters = []
    with open(CHAPTERS_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        chapter_fieldnames = reader.fieldnames
        for row in reader:
            chapter_name = row['name']
            if row['subject_id'] == biology_id:
                if chapter_name in MAPPING['Botany']:
                    row['subject_id'] = botany_id
                elif chapter_name in MAPPING['Zoology']:
                    row['subject_id'] = zoology_id
                else:
                    print(f"Warning: Chapter '{chapter_name}' not in mapping, defaulting to Botany.")
                    row['subject_id'] = botany_id
            updated_chapters.append(row)

    # 4. Write back
    with open(SUBJECTS_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_subjects)

    with open(CHAPTERS_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=chapter_fieldnames)
        writer.writeheader()
        writer.writerows(updated_chapters)

    print("Successfully split Biology into Botany and Zoology in the output directory.")
    print(f"Botany ID: {botany_id}")
    print(f"Zoology ID: {zoology_id}")

if __name__ == "__main__":
    split_biology()
