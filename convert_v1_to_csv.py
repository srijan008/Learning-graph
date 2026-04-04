import os
import re
import csv
import uuid

# Configuration
INPUT_DIR = r"c:\Users\srija\Desktop\Devlopment\Client-Project\yolearn\learning-graph\outputv1"
OUTPUT_DIR = r"c:\Users\srija\Desktop\Devlopment\Client-Project\yolearn\learning-graph\outputv1_processed"

subjects_data = []
chapters_data = []
topics_data = []
subtopics_data = []

def parse_md_file(filepath):
    filename = os.path.basename(filepath)
    # Use filename without extension as subject name
    subject_name = os.path.splitext(filename)[0]
    subject_id = str(uuid.uuid4())
    subjects_data.append([subject_id, subject_name])

    print(f"Processing Subject: {subject_name} ({subject_id})")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.readlines()

    current_chapter_id = None
    current_topic_id = None
    
    chapter_index = 1
    topic_index = 1
    subtopic_index = 1

    in_subtopics_section = False
    
    current_parent_subtopic = None
    current_parent_children = []

    def flush_subtopic():
        nonlocal current_parent_subtopic, current_parent_children, subtopic_index
        if current_parent_subtopic:
            final_title = current_parent_subtopic
            if current_parent_children:
                final_title += f" ({', '.join(current_parent_children)})"
            
            subtopic_id = str(uuid.uuid4())
            subtopics_data.append([subtopic_id, final_title, current_topic_id, subtopic_index])
            subtopic_index += 1
            
            # Reset
            current_parent_subtopic = None
            current_parent_children = []

    for line in content:
        line_raw_full = line.rstrip() # Keep leading spaces for indentation detection
        line_stripped = line_raw_full.strip()
        
        if not line_stripped:
            continue

        # Chapter Header: # Unit N: Name
        chapter_match = re.match(r'^#\s+Unit\s+\d+:\s*(.*)', line_stripped)
        if chapter_match:
            flush_subtopic()
            chapter_name = chapter_match.group(1).strip()
            current_chapter_id = str(uuid.uuid4())
            chapters_data.append([current_chapter_id, chapter_name, chapter_index, subject_id])
            chapter_index += 1
            topic_index = 1 # Reset topic index for new chapter
            in_subtopics_section = False
            continue

        # Topic Header: ## Topic N: Name
        topic_match = re.match(r'^##\s+Topic\s+\d+:\s*(.*)', line_stripped)
        if topic_match:
            flush_subtopic()
            topic_name = topic_match.group(1).strip()
            current_topic_id = str(uuid.uuid4())
            topics_data.append([current_topic_id, topic_name, current_chapter_id, topic_index])
            topic_index += 1
            subtopic_index = 1 # Reset subtopic index for new topic
            in_subtopics_section = False
            continue

        # Section markers
        lower_line = line_stripped.lower()
        if lower_line == 'subtopics' or lower_line == 'micro-concepts':
            flush_subtopic()
            in_subtopics_section = True
            continue

        # Bullet points
        if in_subtopics_section:
            # Check for sub-bullet (leading spaces before dash)
            sub_bullet_match = re.match(r'^(\s+)-\s+(.*)', line_raw_full)
            if sub_bullet_match:
                # This is a child of the current parent
                child_title = sub_bullet_match.group(2).strip()
                current_parent_children.append(child_title)
                continue
            
            # Check for main bullet
            main_bullet_match = re.match(r'^-\s+(.*)', line_raw_full)
            if main_bullet_match:
                flush_subtopic()
                current_parent_subtopic = main_bullet_match.group(1).strip()
                continue
            
        # Horizontal rule or other header
        if line_stripped.startswith('---'):
            flush_subtopic()
            in_subtopics_section = False

    # Final flush
    flush_subtopic()

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # List only .md files
    files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".md")]
    for filename in files:
        parse_md_file(os.path.join(INPUT_DIR, filename))

    # Write CSVs
    with open(os.path.join(OUTPUT_DIR, 'subjects.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name'])
        writer.writerows(subjects_data)

    with open(os.path.join(OUTPUT_DIR, 'chapters.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name', 'order_index', 'subject_id'])
        writer.writerows(chapters_data)

    with open(os.path.join(OUTPUT_DIR, 'topics.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'title', 'chapter_id', 'order_index'])
        writer.writerows(topics_data)

    with open(os.path.join(OUTPUT_DIR, 'subtopics.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'title', 'topic_id', 'order_index'])
        writer.writerows(subtopics_data)

    print("\n--- Summary ---")
    print(f"Successfully processed {len(subjects_data)} subjects.")
    print(f"Total Chapters: {len(chapters_data)}")
    print(f"Total Topics: {len(topics_data)}")
    print(f"Total Subtopics: {len(subtopics_data)}")
    print(f"Outputs saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
