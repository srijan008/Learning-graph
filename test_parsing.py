import re
import uuid

def parse_md_content(content):
    chapters_data = []
    topics_data = []
    subtopics_data = []
    
    current_chapter_id = None
    current_topic_id = None
    subject_id = "test-subject"
    
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

    for line in content.splitlines():
        line_raw_full = line.rstrip() 
        line_stripped = line_raw_full.strip()
        
        if not line_stripped:
            continue

        chapter_match = re.match(r'^#\s+Unit\s+\d+:\s*(.*)', line_stripped)
        if chapter_match:
            flush_subtopic()
            chapter_name = chapter_match.group(1).strip()
            current_chapter_id = str(uuid.uuid4())
            chapters_data.append([current_chapter_id, chapter_name, chapter_index, subject_id])
            chapter_index += 1
            topic_index = 1
            in_subtopics_section = False
            continue

        topic_match = re.match(r'^##\s+Topic\s+\d+:\s*(.*)', line_stripped)
        if topic_match:
            flush_subtopic()
            topic_name = topic_match.group(1).strip()
            current_topic_id = str(uuid.uuid4())
            topics_data.append([current_topic_id, topic_name, current_chapter_id, topic_index])
            topic_index += 1
            subtopic_index = 1
            in_subtopics_section = False
            continue

        lower_line = line_stripped.lower()
        if lower_line == 'subtopics' or lower_line == 'micro-concepts':
            flush_subtopic()
            in_subtopics_section = True
            continue

        if in_subtopics_section:
            # Matches any leading whitespace - then title
            sub_bullet_match = re.match(r'^(\s+)-\s+(.*)', line_raw_full)
            if sub_bullet_match:
                child_title = sub_bullet_match.group(2).strip()
                current_parent_children.append(child_title)
                continue
            
            main_bullet_match = re.match(r'^-\s+(.*)', line_raw_full)
            if main_bullet_match:
                flush_subtopic()
                current_parent_subtopic = main_bullet_match.group(1).strip()
                continue
            
        if line_stripped.startswith('---'):
            flush_subtopic()
            in_subtopics_section = False

    flush_subtopic()
    return subtopics_data

content = """
# Unit 1: Test Unit
## Topic 1: Test Topic
Subtopics
- Parent 1
  - Child A
  - Child B
- Parent 2
  - Child C
Micro-concepts
- Concept X
- Concept Y
"""

subtopics = parse_md_content(content)
for s in subtopics:
    print(s[1])
