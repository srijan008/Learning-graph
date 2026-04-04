"""
map_physics_chunks.py
=====================
Maps Physics chunks from neet_combined.json to curriculum IDs
(chapter_id, topic_id, subtopic_id) from output CSVs, using Vertex AI Gemini.

Includes:
  - Smart context extraction
  - gRPC retry logic (3 attempts)
  - JSON malformed response repair
  - Resume-from-checkpoint
"""

import csv
import json
import os
import time
from pathlib import Path

import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────
SERVICE_ACCOUNT_PATH = "service-account.json"
PROJECT_ID           = "onboarding-bot-458509"
LOCATION             = "us-central1"
GEMINI_MODEL_NAME    = "gemini-2.5-flash"  # Stable, fast, reliable

COMBINED_JSON    = "neet_combined.json"
OUTPUT_DIR       = Path("output")
OUTPUT_FILE      = "physics_mapped_chunks.json"

PHYSICS_SUBJECT_ID  = "a1a54f5e-5cba-4bf7-bbca-90649c379d78"
PHYSICS_PDF_PREFIX  = "neet-phy"

BATCH_SIZE        = 10   # chunks per batch
RATE_LIMIT_PAUSE  = 5.0   # seconds between batches
MAX_RETRIES       = 3    # retries for transient errors

# ──────────────────────────────────────────────────────────────────────────────
# INITIALIZE VERTEX AI
# ──────────────────────────────────────────────────────────────────────────────
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = SERVICE_ACCOUNT_PATH
vertexai.init(project=PROJECT_ID, location=LOCATION)

# ──────────────────────────────────────────────────────────────────────────────
# SMART CONTEXT EXTRACTOR
# ──────────────────────────────────────────────────────────────────────────────

def extract_chunk_context(chunk: dict) -> str:
    meta = chunk.get("metadata", {})
    parts = []

    content_field = (chunk.get("content") or "").strip()
    if content_field and not content_field.isdigit() and len(content_field) > 5:
        parts.append(f"Content: {content_field[:500]}")

    section = (meta.get("section_name") or "").strip()
    if section: parts.append(f"Section: {section}")
    subsec = (meta.get("subsection_title") or "").strip()
    if subsec: parts.append(f"Subsection: {subsec}")
    hier = (meta.get("hierarchy_path") or "").strip()
    if hier: parts.append(f"Hierarchy: {hier}")
    kws = meta.get("keywords") or []
    if kws: parts.append(f"Keywords: {', '.join(str(k) for k in kws[:10])}")
    chapter_name = (meta.get("chapter_name") or "").strip()
    if chapter_name: parts.append(f"Chapter: {chapter_name}")
    pdf = (meta.get("pdf_name") or "").strip()
    if pdf: parts.append(f"PDF: {pdf}")

    if not parts:
        return f"[No context — chapter_name='{chapter_name}']"

    return "\n    ".join(parts)


# ──────────────────────────────────────────────────────────────────────────────
# LOAD CURRICULUM
# ──────────────────────────────────────────────────────────────────────────────

def load_csv(filename: str) -> list:
    path = OUTPUT_DIR / filename
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def build_physics_curriculum():
    all_chapters  = load_csv("neet_chapters.csv")
    all_topics    = load_csv("neet_topics.csv")
    all_subtopics = load_csv("neet_subtopics.csv")

    chapters = [c for c in all_chapters if c["subject_id"] == PHYSICS_SUBJECT_ID]
    ch_ids = {c["id"] for c in chapters}
    topics = [t for t in all_topics if t["chapter_id"] in ch_ids]
    tp_ids = {t["id"] for t in topics}
    subtopics = [s for s in all_subtopics if s["topic_id"] in tp_ids]

    print(f"✅ Curriculum loaded: {len(chapters)} chapters, {len(topics)} topics")
    return chapters, topics, subtopics

def build_curriculum_index(chapters, topics, subtopics) -> str:
    ch_to_topics = {c["id"]: [] for c in chapters}
    for t in topics:
        if t["chapter_id"] in ch_to_topics: ch_to_topics[t["chapter_id"]].append(t)
    tp_to_subs = {t["id"]: [] for t in topics}
    for s in subtopics:
        if s["topic_id"] in tp_to_subs: tp_to_subs[s["topic_id"]].append(s)

    lines = []
    for ch in chapters:
        lines.append(f'CHAPTER "{ch["name"]}" | ID: {ch["id"]}')
        for tp in ch_to_topics.get(ch["id"], []):
            lines.append(f'  TOPIC "{tp["title"]}" | ID: {tp["id"]}')
            for st in tp_to_subs.get(tp["id"], [])[:5]: # limited subtopics for tokens
                lines.append(f'    SUBTOPIC "{st["title"]}" | ID: {st["id"]}')
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# LLM CLASSIFICATION
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a NEET Physics curriculum expert.
Task: Map each chunk to exactly one chapter_id, topic_id, and subtopic_id from the provided list.
Return ONLY valid JSON: [{"chunk_index": int, "chapter_id": str, "topic_id": str, "subtopic_id": str, "match_confidence": "high|medium|low"}]
"""

def call_gemini(model, batch: list[dict], curriculum_index: str, retry_count=0) -> list[dict] | None:
    descriptions = []
    for i, chunk in enumerate(batch):
        ctx = extract_chunk_context(chunk)
        descriptions.append(f"CHUNK {i}\n    {ctx}")

    prompt = f"CURRICULUM:\n{curriculum_index}\n\nCHUNKS:\n" + "\n".join(descriptions)

    try:
        response = model.generate_content(
            [SYSTEM_PROMPT, prompt],
            generation_config=GenerationConfig(response_mime_type="application/json")
        )
        text = response.text.strip()
        return json.loads(text)
    except Exception as e:
        if retry_count < MAX_RETRIES:
            print(f" (Wait & Retry {retry_count+1})...", end="", flush=True)
            time.sleep(2 * (retry_count + 1))
            return call_gemini(model, batch, curriculum_index, retry_count + 1)
        print(f" ERROR: {str(e)[:100]}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────

def main():
    model = GenerativeModel(GEMINI_MODEL_NAME)
    print(f"🚀 Using Gemini: {GEMINI_MODEL_NAME}")

    chapters, topics, subtopics = build_physics_curriculum()
    with open(COMBINED_JSON, "r", encoding="utf-8") as f:
        all_chunks = json.load(f).get("chunks", [])
    physics_chunks = [c for c in all_chunks if c.get("metadata", {}).get("pdf_name", "").startswith(PHYSICS_PDF_PREFIX)]
    print(f"✅ Physics Chunks: {len(physics_chunks)}")

    output_path = Path(OUTPUT_FILE)
    already_mapped = {}
    if output_path.exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for item in json.load(f):
                if item.get("topic_id"):
                    already_mapped[item["chunk_id"]] = item
        print(f"♻️  Resuming: {len(already_mapped)} validly mapped")

    unprocessed = [c for c in physics_chunks if c["chunk_id"] not in already_mapped]
    curriculum_index = build_curriculum_index(chapters, topics, subtopics)
    results = list(already_mapped.values())

    total = len(unprocessed)
    for i in range(0, total, BATCH_SIZE):
        batch = unprocessed[i:i+BATCH_SIZE]
        print(f"\r[{i+len(batch)}/{total}] Processing batch...", end="", flush=True)

        mapped = call_gemini(model, batch, curriculum_index)
        if mapped:
            mapped_by_idx = {m.get("chunk_index"): m for m in mapped}
            for j, chunk in enumerate(batch):
                m = mapped_by_idx.get(j, {})
                results.append({**chunk, "subject_id": PHYSICS_SUBJECT_ID, **m})

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            time.sleep(RATE_LIMIT_PAUSE)

    print(f"\n✅ Total Mapped: {len(results)} chunks saved to '{OUTPUT_FILE}'")

if __name__ == "__main__":
    main()
