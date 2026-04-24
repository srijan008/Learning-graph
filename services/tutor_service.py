"""
AI Tutor Service — handles Gemini calls with stateful rolling summary context.
One session per (user, topic). Independent confidence scores per subtopic.
"""
import os
import json
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from google import genai

load_dotenv()

SUMMARY_THRESHOLD = 8   # summarise older messages after this many total exchanges
FAST_MODEL = "gemini-1.5-flash"  # stableGA flash model for Vertex AI

KEEP_RECENT = 4         # how many recent messages to keep after summarising

# In-memory context cache: {session_id: {"context": str, "expires_at": float}}
# Avoids re-fetching Qdrant/Postgres on every chat message (huge latency reduction)
_CONTEXT_CACHE: dict = {}

SYSTEM_TUTOR_PROMPT = """\
You are an expert AI tutor specializing in NEET-level science education.
Your teaching style is:
- Clear, structured, and encouraging
- Uses analogies when introducing new concepts
- Asks Socratic follow-up questions to check understanding
- Adapts depth based on the student's responses
- 70% of your interaction is theoretical explanation, 30% problem-solving

Always respond naturally as a tutor in a conversation. After your response you MUST include
a JSON block at the very end (on a new line, in a ```json block):
{
  "subtopics_assessed": [
    {
      "subtopic_id": "<exact_id_from_context>",
      "theory_confidence": <0-100>,
      "example_confidence": <0-100>,
      "cross_section_confidence": <0-100>,
      "is_completed": <true|false>
    }
  ],
  "doubts_detected": [
    {
      "subtopic_id": "<exact_id_from_context>",
      "doubt_type": "conceptual | calculation | misconception | other",
      "description": "One sentence: what the student misunderstood or is confused about"
    }
  ]
}
Where:
- "theory_confidence" (0-100): High accuracy understanding of core concepts. Increase this proportionally as the student demonstrates knowledge. 70+ is considered Mastery.
- "example_confidence" (0-100): Ability to solve standard numerical examples or apply concepts directly.
Crucial Guidelines:
1. Assess multiple subtopics in one go if the student's message covers multiple areas. Be generous if they provide a large, accurate explanation.
2. Broad Coverage: If the student provides a summary or explanation that covers the entire topic or multiple subtopics, you MUST identify and score EVERY subtopic involved using the OFFICIAL SUBTOPIC LIST mapping. Do not just focus on one.
3. Do NOT be overly conservative. If the student clearly knows a concept, give them at least 70% confidence immediately.
4. Never mention the JSON schema or explicit ID strings in your response. The JSON is hidden metadata.
"""

def _get_gemini_client():
    service_account_path = os.getenv("GEMINI_SERVICE_ACCOUNT_PATH")
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "onboarding-bot-458509")
    if service_account_path and os.path.exists(service_account_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
        return genai.Client(vertexai=True, project=project_id, location="us-central1")
    return genai.Client()


def _build_prompt_messages(prior_summary: Optional[str], recent_messages: list) -> str:
    """Assemble the context-compressed message history into a single prompt string."""
    parts = [SYSTEM_TUTOR_PROMPT]
    if prior_summary:
        parts.append(f"\n--- SUMMARY OF EARLIER CONVERSATION ---\n{prior_summary}\n--- END SUMMARY ---\n")
    for msg in recent_messages:
        role = msg["role"].upper()
        parts.append(f"{role}: {msg['content']}")
    return "\n".join(parts)


def _parse_llm_response(raw_text: str) -> tuple[str, dict, list]:
    """
    Split LLM reply into:
      - visible reply text (shown to student)
      - subtopic_scores dict: {subtopic_id -> {"theory": int, "example": int, "cross": int, "is_completed": bool}}
      - doubts_detected list: [{subtopic_id, doubt_type, description}]
    """
    scores_dict = {}
    doubts_list = []
    reply_text = raw_text

    try:
        if "```json" in raw_text:
            json_start = raw_text.rfind("```json") + 7
            json_end = raw_text.rfind("```", json_start)
            json_str = raw_text[json_start:json_end].strip()
            print("___RAW JSON FROM LLM___:", json_str)
            meta = json.loads(json_str)

            items = meta.get("subtopics_assessed", [])
            for item in items:
                sid = item.get("subtopic_id")
                if sid:
                    scores_dict[sid] = {
                        "theory": int(item.get("theory_confidence", 0)),
                        "example": int(item.get("example_confidence", 0)),
                        "cross": int(item.get("cross_section_confidence", 0)),
                        "is_completed": bool(item.get("is_completed", False))
                    }

            doubts_list = meta.get("doubts_detected", [])
            print("___PARSED DOUBTS___:", doubts_list)

            # Strip JSON block from visible reply
            reply_text = raw_text[:raw_text.rfind("```json")].strip()
    except Exception as e:
        print("___JSON PARSE ERROR___:", str(e))
        pass  # Gracefully handle if LLM doesn't return JSON

    return reply_text, scores_dict, doubts_list


async def generate_topic_greeting(
    topic_name: str,
    subtopics: list[dict],
    doubt_context: Optional[str] = None,
) -> str:
    """
    Generate a ONE-TIME greeting when a student enters study mode.
    If doubt_context is set, produces a targeted greeting addressing their known confusion.
    """
    client = _get_gemini_client()
    # Check multiple env vars for flexibility
    model = os.getenv("GEMINI_TUTOR_MODEL") or os.getenv("GEMINI_MODEL") or FAST_MODEL

    def _fmt_subtopic(s: dict) -> str:
        conf = s.get('confidence', 0)
        if isinstance(conf, dict):
            # Calculate an average for display if it's the new format
            avg = (conf.get('theory', 0) + conf.get('example', 0) + conf.get('cross', 0)) // 3
            label = 'Not started yet' if avg == 0 else f'{avg}% average confidence'
        else:
            label = 'Not started yet' if conf == 0 else f'{conf}% confidence'
        return f"- {s['name']}: {label}"

    sub_lines = "\n".join(_fmt_subtopic(s) for s in subtopics)

    if doubt_context:
        prompt = f"""You are an expert NEET science tutor. A student is returning to study **{topic_name}** because they had a specific confusion.

Known confusion: {doubt_context}

Their subtopics and current confidence:
{sub_lines}

Write a warm, SHORT re-entry message (3-5 sentences) that:
1. Acknowledges the specific confusion by concept name (do not be vague)
2. Reassures them it is a common sticking point
3. Invites them to start with their first question

Be concise and empathetic. Do NOT include JSON."""
    else:
        prompt = f"""You are an expert NEET science tutor. A student has just opened the study session for the topic: **{topic_name}**.

Here are their subtopics and current confidence levels:
{sub_lines}

Write a SHORT, warm greeting (3-5 sentences max) that:
1. Welcomes them to the topic
2. Based on the confidence scores, points out which subtopics look weakest and suggests starting there
3. Encourages them to ask you anything about any subtopic

If all are at 0%, just welcome them and list 3 suggested questions to start with.
Be concise and motivating. Do NOT include JSON."""

    response = await client.aio.models.generate_content(model=model, contents=prompt)
    return response.text.strip()


async def generate_summary(messages: list) -> str:
    """Compress old messages into a compact paragraph for the rolling summary."""
    client = _get_gemini_client()
    model = os.getenv("GEMINI_MODEL", FAST_MODEL)
    
    history = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in messages])
    prompt = f"""Summarise the following tutoring conversation into a single compact paragraph.
        Focus on: what concepts were covered, key explanations given, questions asked, and apparent student understanding.
        Be concise but complete enough that a tutor could pick up the conversation seamlessly.

        CONVERSATION:
        {history}

        SUMMARY:"""
            
    response = await client.aio.models.generate_content(model=model, contents=prompt)
    return response.text.strip()


async def chat_with_tutor_stream(
    prior_summary: Optional[str],
    recent_messages: list,
    user_message: str,
    subtopics_context: str,
    subtopic_id: str = None,
    current_scores: dict = None,
    session_id: str = None,
    topic_id: str = None,
):
    """
    Streams response from Gemini tutor chunk by chunk.
    Injects full topic textbook context and current scores for accurate multi-subtopic assessment.
    """
    # 1. Fetch relevant textbook context
    from services.tutor_context import get_subtopic_context, get_topic_context_all
    
    client = _get_gemini_client()
    model = os.getenv("GEMINI_MODEL", FAST_MODEL)

    textbook_context = ""
    _now = __import__("time").time()
    _cached = _CONTEXT_CACHE.get(session_id or "")
    if _cached and _cached["expires_at"] > _now:
        textbook_context = _cached["context"]
    elif session_id and topic_id:
        textbook_context = await get_topic_context_all(session_id, topic_id)
        _CONTEXT_CACHE[session_id] = {"context": textbook_context, "expires_at": _now + 3600}
    elif session_id and subtopic_id:
        textbook_context = await get_subtopic_context(subtopic_id, session_id, topic_id)
        _CONTEXT_CACHE[session_id] = {"context": textbook_context, "expires_at": _now + 3600}
    # 2. Format current scores for the prompt
    scores_info = ""
    if current_scores:
        scores_lines = []
        for sid, val in current_scores.items():
            if isinstance(val, dict):
                t = val.get("theory", 0)
                e = val.get("example", 0)
                c = val.get("cross", 0)
                scores_lines.append(f"- ID: {sid} | Theory: {t}%, Example: {e}%, Cross-Section: {c}%")
            else:
                scores_lines.append(f"- ID: {sid} | Current Avg Confidence: {val}%")
        scores_info = "\n".join(scores_lines)

    context = _build_prompt_messages(prior_summary, recent_messages)
    
    full_prompt = f"""{context}

    ### TEXTBOOK CONTEXT FOR THE ENTIRE TOPIC (ALL SUBTOPICS):
    {textbook_context}

    ### CURRENT SUBTOPIC CONFIDENCE SCORES:
    {scores_info}

    ### OFFICIAL SUBTOPIC LIST (Use these IDs for JSON):
    {subtopics_context}

    USER: {user_message}
    TUTOR:"""

    full_response_text = ""
    yielded_length = 0
    json_start_found = False

    # Standard stream
    response_stream = await client.aio.models.generate_content_stream(model=model, contents=full_prompt)
    
    async for chunk in response_stream:
        text = chunk.text
        if not text: continue
        
        full_response_text += text
        
        if not json_start_found:
            # Check if JSON block starts in the current cumulative text
            idx = full_response_text.find("```json")
            if idx != -1:
                json_start_found = True
                # Yield everything from the last yielded point up to the JSON start
                to_yield = full_response_text[yielded_length:idx]
                if to_yield:
                    yield to_yield
                yielded_length = idx
            else:
                # Still no JSON block. Safe-yield everything up to (current_length - 10)
                # to avoid splitting the ```json tag across chunks and missing it.
                safe_length = len(full_response_text) - 10
                if safe_length > yielded_length:
                    to_yield = full_response_text[yielded_length:safe_length]
                    yield to_yield
                    yielded_length = safe_length

    # After stream finishes, yield any remaining text BEFORE the JSON block if it was never found
    if not json_start_found and len(full_response_text) > yielded_length:
        yield full_response_text[yielded_length:]

    # Parse for metadata
    visible_text, scores_dict, doubts_list = _parse_llm_response(full_response_text)

    # Only yield metadata if there's actual signal (non-zero scores or doubts)
    has_signal = False
    if doubts_list:
        has_signal = True
    else:
        for sid, info in scores_dict.items():
            if isinstance(info, dict):
                if info.get("theory", 0) > 0 or info.get("example", 0) > 0 or info.get("cross", 0) > 0:
                    has_signal = True
                    break
            else:
                if info > 0:
                    has_signal = True
                    break

    if has_signal:
        # yield flat JSON format for frontend compatibility if needed, or structured
        yield f"\n__METADATA__{json.dumps({'scores': scores_dict, 'doubts': doubts_list})}"


async def generate_chapter_formulas(chapter_name: str) -> str:
    """
    Dynamically generates a comprehensive, Markdown-formatted formula sheet 
    for the given chapter name using Gemini. 
    """
    client = _get_gemini_client()
    model = os.getenv("GEMINI_MODEL", FAST_MODEL)
    
    prompt = f"""You are an expert NEET/JEE science tutor. 
Please generate a comprehensive formula sheet for the chapter: "{chapter_name}".

Format your response strictly in Markdown:
1. Use ## for main sections.
2. Use bullet points for individual formulas.
3. Use proper LaTeX math blocks ($$ for block math and $ for inline math).
4. Include a brief (1 sentence) description of what each formula calculates or when to use it.
5. If the chapter does not typically have mathematical formulas (e.g. Biological classification), provide key conceptual rules, laws, or mnemonics instead.

Do not include any conversational filler, just the formula sheet.
"""
    try:
        response = await client.aio.models.generate_content(model=model, contents=prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error generating formulas for {chapter_name}: {e}")
        return f"Failed to generate formulas for {chapter_name}. Please try again later."


async def generate_ai_sketch(topic_name: str, chapter_name: str) -> list:
    """Generates a structured list of drawing commands for a scientific sketch."""
    client = _get_gemini_client()
    model = os.getenv("GEMINI_MODEL", FAST_MODEL)
    
    prompt = f"""
    Generate a structured scientific sketch for the topic '{topic_name}' in the chapter '{chapter_name}'.
    The sketch should be educational, clear, and include labels.
    
    Return ONLY a JSON list of drawing commands. No other text.
    Commands can be:
    - {{"type": "line", "x1": int, "y1": int, "x2": int, "y2": int, "color": "string"}}
    - {{"type": "circle", "x": int, "y": int, "r": int, "color": "string", "fill": bool}}
    - {{"type": "rect", "x": int, "y": int, "w": int, "h": int, "color": "string", "fill": bool}}
    - {{"type": "text", "x": int, "y": int, "text": "string", "color": "string", "size": int}}
    
    Canvas size is 1600x1000. Use colors like '#6366f1', '#10b981', '#f59e0b', '#ec4899', 'white'.
    Keep it minimalist and hand-drawn style.
    """
    
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
            }
        )
        data = json.loads(response.text)
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"Error generating AI sketch for {topic_name}: {e}")
        return []


async def generate_infographic_sketch(query: str) -> list:
    """Generates a high-density infographic sketch for a user-provided concept."""
    client = _get_gemini_client()
    model = os.getenv("GEMINI_MODEL", FAST_MODEL)
    
    prompt = f"""
    Create a professional, high-fidelity scientific infographic for: '{query}'.
    
    LAYOUT RULES (Canvas 1600x1000):
    1. Title: Large bold text at the top center (y=80).
    2. Central Visual: A complex, multi-part diagram in the center area (x:500-1100, y:200-800). Use multiple circles, connecting lines, and shapes to represent the concept visually.
    3. Info Cards: 4 distinct rectangular "cards" placed in the corners. Each card MUST have a semi-transparent background rect and 3-4 lines of text.
    4. No Overlap: DO NOT place text or cards over the central visual. Keep them separated.
    5. Aesthetics: Use a "Modern Dark" palette.
       - Backgrounds: 'rgba(255, 255, 255, 0.05)'
       - Accents: '#818cf8' (Indigo), '#34d399' (Emerald), '#fbbf24' (Amber)
       - Text: 'white' for headers, '#94a3b8' for details.
    
    Card Positioning (Strict):
    - Top-Left Card: x:50, y:150, w:380, h:280
    - Top-Right Card: x:1170, y:150, w:380, h:280
    - Bottom-Left Card: x:50, y:670, w:380, h:280
    - Bottom-Right Card: x:1170, y:670, w:380, h:280
    
    Return ONLY a JSON list of drawing commands:
    - {{"type": "line", "x1", "y1", "x2", "y2", "color"}}
    - {{"type": "circle", "x", "y", "r", "color", "fill"}}
    - {{"type": "rect", "x", "y", "w", "h", "color", "fill"}}
    - {{"type": "text", "x", "y", "text", "color", "size"}}
    
    Aim for 70-100 commands. Make it look organized, premium, and scientific.
    """
    
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
            }
        )
        data = json.loads(response.text)
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"Error generating Infographic for {query}: {e}")
        return []
