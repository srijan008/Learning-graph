import os
import asyncio
import json
import logging
import traceback
import uuid
from typing import List, Optional, Any, Dict
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db.postgres_client import engine as main_engine
from db.postgres_models import (
    UserSubtopicProgress, SubtopicStatus, UserMistakeTracking, 
    MistakeType, UserTestReport, UserTestAnswer, CurriculumChunk
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/practice", tags=["practice"])

COLLECTION_MAP = {
    "CBSE": "Learning_Grade1-5",
    "NEET": "neet_chapter_combined",
    "JEE": "jee_chapter_combined",
}

# --- New Models for Postgres PYQ ---
class NeetPYQQuestion(BaseModel):
    """Minimized question data for frontend."""
    id: str  # maps to chunk_id
    question: str  # maps to cleaned display_content
    options: List[str] = []
    years_appeared: List[str] = []

class NeetPYQResponse(BaseModel):
    """Response for the NEET PYQ query endpoint."""
    status: str
    count: int
    questions: List[NeetPYQQuestion]

class TestAnswer(BaseModel):
    question_id: str
    selected_option: Optional[str] = None
    time_taken: int = 0

class FinishTestRequest(BaseModel):
    user_id: str = "temp-student"
    curriculum: str = "NEET"
    subject_id: Optional[str] = None
    chapter_id: Optional[str] = None
    topic_id: Optional[str] = None
    subtopic_name: Optional[str] = None
    answers: List[TestAnswer]

class TestResultItem(BaseModel):
    question_id: str
    question_text: str
    options: List[str]
    selected_option: Optional[str] = None
    correct_option: Optional[str] = None
    is_correct: bool
    solution_text: str
    years_appeared: List[str] = []

class FinishTestResponse(BaseModel):
    status: str
    report_id: str
    score: int
    total: int
    results: List[TestResultItem]

class EvaluateAnswerRequest(BaseModel):
    question_id: str
    selected_option: str | None = None
    student_answer: str | None = None
    curriculum: str = "NEET"

# --- Secondary Postgres Engine for PYQs (External) ---
PYQ_DB_URL = os.getenv("PYQ_DATABASE_URL", "")
# Convert to asyncpg if needed
if PYQ_DB_URL and PYQ_DB_URL.startswith("postgres://"):
    PYQ_DB_URL = PYQ_DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if PYQ_DB_URL and "sslmode=require" in PYQ_DB_URL:
    PYQ_DB_URL = PYQ_DB_URL.replace("sslmode=require", "ssl=require")

pyq_engine = create_async_engine(PYQ_DB_URL) if PYQ_DB_URL else None

from dotenv import load_dotenv
load_dotenv()

# Initialize Gemini Client using Service Account if provided
try:
    from google import genai
    from google.genai import types
    from google.oauth2 import service_account
    
    service_account_path = os.getenv("GEMINI_SERVICE_ACCOUNT_PATH")
    api_key = os.getenv("GEMINI_API_KEY")
    
    if service_account_path and os.path.exists(service_account_path):
        logger.info(f"Initializing Gemini with Service Account: {service_account_path}")
        creds = service_account.Credentials.from_service_account_file(
            service_account_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        gemini_client = genai.Client(
            vertexai=True,
            project=json.load(open(service_account_path))["project_id"],
            location="us-central1", # Default Vertex location
            credentials=creds
        )
    elif api_key:
        logger.info("Initializing Gemini with API Key")
        gemini_client = genai.Client(api_key=api_key)
    else:
        logger.warning("No Gemini API Key or Service Account provided. Vector search will fail.")
        gemini_client = None
except Exception as e:
    logger.error(f"Failed to initialize Gemini client: {e}")
    gemini_client = None

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

import re

def format_llm_context(chunks: List[Dict[str, Any]]) -> str:
    """Helper to format chunks into a single context string for LLMs."""
    context_parts = []
    for i, chunk in enumerate(chunks):
        content = chunk.get("content", "")
        meta = chunk.get("metadata", {})
        # Try to find a good title from metadata
        title = meta.get("subtopic_name") or meta.get("topic_name") or meta.get("chapter_name") or f"Source {i+1}"
        context_parts.append(f"--- SOURCE: {title} ---\n{content}")
    return "\n\n".join(context_parts)

def clean_img_placeholders(text: str) -> str:
    """Remove words containing 'img-' and markdown image syntax from text."""
    if not text: return ""
    # Remove markdown images: ![alt](img-...)
    text = re.sub(r'!\[.*?\]\((?:img-|.*?img-).*?\)', '', text)
    # Remove standalone img- tokens or words containing them
    text = re.sub(r'\b\S*img-\S*\b', '', text)
    # Clean up extra newlines/spaces left behind
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text

async def get_embedding(text: str, dimension: Optional[int] = None) -> list[float] | None:
    """Generate embedding for a given text using Gemini API with optional dimension constraint."""
    if not gemini_client:
        return None
    try:
        # For Vertex AI Gemini SDK (google-genai 1.x)
        is_vertex = getattr(gemini_client, "_config", {}).get("vertexai", False)
        model_id = 'publishers/google/models/text-embedding-004' if is_vertex else 'text-embedding-004'
        
        # Configure dimensionality if specified
        config = None
        if dimension:
            config = types.EmbedContentConfig(output_dimensionality=dimension)
            
        response = gemini_client.models.embed_content(
            model=model_id,
            contents=text,
            config=config
        )
        return response.embeddings[0].values
    except Exception as e:
        logger.error(f"Error generating embedding (dim={dimension}): {e}")
        return None

def extract_correct_answer_util(text: str, metadata: Dict[str, Any]) -> Optional[str]:
    """Extract correct answer from metadata or text content with regex."""
    
    def _clean_val(val):
        if val is None: return None
        if isinstance(val, (int, float)):
            idx = int(val)
            if 1 <= idx <= 4: return "ABCD"[idx-1]
        if isinstance(val, str) and len(val.strip()) >= 1:
            clean = val.split(":")[0].strip().upper()
            if len(clean) == 1 and clean in "ABCD": return clean
            if clean in "1234": return "ABCD"[int(clean)-1]
        return None

    # 1. Check top-level metadata
    for key in ["Correct Answer", "correct_option", "answer", "ans", "correct"]:
        ans = _clean_val(metadata.get(key))
        if ans: return ans
        
    # 2. Check nested 'question_data'
    q_data = metadata.get("question_data", {})
    if isinstance(q_data, dict):
        for key in ["answer", "correct_option", "correct"]:
            ans = _clean_val(q_data.get(key))
            if ans: return ans
    
    # 3. Check text for common patterns
    patterns = [
        r"Ans:?\s*\(?([A-D])\)?",
        r"Correct\s*(?:Option|Answer)?:?\s*([A-D])",
        r"Answer:?\s*([A-D])",
        r"\[([A-D])\]",
        r"Ans:?\s*\(?([1-4])\)?",
        r"Answer:?\s*([1-4])",
        r"Correct\s*(?:Option|Answer)?:?\s*([1-4])"
    ]
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            raw = match.group(1).upper()
            if raw in "1234": return "ABCD"[int(raw)-1]
            return raw
            
    return None

async def get_llm_answer(question: str, options: List[str]) -> Optional[str]:
    """Use Gemini to solve MCQ if answer is missing from database."""
    if not gemini_client:
        return None
    
    prompt = f"""
    Context: You are a professional NEET examination evaluator.
    Task: Solve the following Multiple Choice Question (MCQ).
    Constraint: You MUST select exactly ONE option from the provided list (A, B, C, or D).
    Format: Return ONLY the single letter (A, B, C, or D) with NO additional text, punctuation, or explanation.
    
    Question: {question}
    
    Options:
    {chr(10).join(options)}
    
    Correct Option Letter (Return only A, B, C, or D):
    """
    try:
        response = await asyncio.to_thread(
            gemini_client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt
        )
        answer = response.text.strip().upper()
        if len(answer) >= 1 and answer[0] in "ABCD":
            return answer[0]
        return None
    except Exception as e:
        logger.error(f"LLM Solver Error: {e}")
        return None

import re

def extract_options_util(text: str, metadata: dict) -> List[str]:
    """Robustly extract MCQ options from metadata or text content with block isolation."""
    # 1. Direct 'options' array in metadata
    options = metadata.get("options", [])
    if options and isinstance(options, list) and len(options) >= 2:
        return [str(o) for o in options]
    
    # 2. Individual keys A, B, C, D in metadata
    meta_options = []
    for k in ['A', 'B', 'C', 'D']:
        val = metadata.get(k) or metadata.get(k.lower())
        if val:
            meta_options.append(f"{k}: {val}")
    if len(meta_options) >= 2:
        return meta_options
        
    # 3. Block Isolation and Regex extraction from text
    # Isolate relevant section to avoid matching letters in 'Solution' or 'Question'
    target_block = text
    if "Options:" in text:
        # Extract everything after "Options:"
        after_options = text.split("Options:", 1)[1]
        # But stop at "Solution:", "Answer:", or similar markers
        stop_markers = ["Solution:", "Answer:", "Explanation:", "Correct Answer:"]
        isolated = after_options
        for marker in stop_markers:
            if marker in isolated:
                isolated = isolated.split(marker, 1)[0]
                break
        target_block = isolated

    # Regex refinement: Matches A) ... B) ... or A. ... B. ...
    # We look for A, B, C, D specifically at the start of a boundary or after a space
    pattern = r"(?:\b|[\(\[])([A-D])[\)\.\s-]\s*(.*?)(?=\s*[\(\[]?[A-D][\)\.\s-]|$)"
    matches = re.findall(pattern, target_block, re.DOTALL | re.IGNORECASE)
    
    if matches:
        extracted = []
        for m in matches:
            opt_label = m[0].upper()
            opt_text = m[1].strip()
            # Clean up trailing content if it matched too much
            if opt_text:
                # Sanity: options usually don't contain common break words
                for marker in ["Solution:", "Answer:"]:
                    if marker in opt_text:
                        opt_text = opt_text.split(marker)[0].strip()
                
                if opt_text and len(opt_text) < 500:
                    extracted.append(f"{opt_label}) {opt_text}")
        
        if len(extracted) >= 2:
            return extracted
            
    return []

async def resolve_topic_name(topic_id: str) -> str:
    """Resolve a topic ID to its human-readable name using Postgres taxonomy tables."""
    if not pyq_engine:
        return topic_id
        
    try:
        async with pyq_engine.connect() as conn:
            # Try subtopics (uses 'name' in DB)
            res = await conn.execute(
                text("SELECT title FROM subtopics WHERE id = :tid"),
                {"tid": topic_id}
            )
            row = res.mappings().first()
            if row: return row["title"]
            
            # Try topics
            res = await conn.execute(
                text("SELECT name FROM topics WHERE id = :tid"),
                {"tid": topic_id}
            )
            row = res.mappings().first()
            if row: return row["name"]
            
            # Try chapters
            res = await conn.execute(
                text("SELECT name FROM chapters WHERE id = :tid"),
                {"tid": topic_id}
            )
            row = res.mappings().first()
            if row: return row["name"]
                
            return topic_id
    except Exception as e:
        logger.warning(f"Failed to resolve topic name from Postgres: {e}")
        return topic_id
    return topic_id

@router.get("/questions/{curriculum}/{subtopic_id}", response_model=NeetPYQResponse)
async def get_practice_questions(curriculum: str, subtopic_id: str, limit: int = 15, subject_id: Optional[str] = None, subtopic_name: Optional[str] = None):
    """
    Get practice questions from PostgreSQL (ai-books.curriculum_chunks).
    """
    try:
        questions = []
        seen_ids = set()

        async with main_engine.connect() as conn:
            # Search curriculum_chunks for questions matching the subtopic_id
            # metadata->>'chunk_type' filter can be added if available
            res = await conn.execute(
                text("""
                    SELECT id, metadata, content 
                    FROM "ai-books".curriculum_chunks 
                    WHERE subtopic_id = :sid 
                    LIMIT :limit
                """),
                {"sid": subtopic_id, "limit": limit}
            )
            rows = res.mappings().all()
            for row in rows:
                qid = str(row["id"])
                if qid in seen_ids: continue
                
                meta = row["metadata"] or {}
                full_text = str(row["content"] or "")
                
                # Process content
                display_content = clean_img_placeholders(full_text)
                options_list = extract_options_util(full_text, meta)
                
                # Clean display content (Solution, Explanation, etc.)
                stop_markers = ["Solution:", "Explanation:", "Answer:", "Correct Answer:"]
                for marker in stop_markers:
                    if marker in display_content:
                        display_content = display_content.split(marker, 1)[0]
                if "Options:" in display_content:
                    display_content = display_content.split("Options:", 1)[0]
                display_content = display_content.strip()
                if "Question:" in display_content:
                    display_content = display_content.split("Question:", 1)[1].strip()

                # Extract years from metadata
                years = meta.get("question_data", {}).get("years_appeared", [])
                if not years: years = meta.get("years_appeared", [])
                if isinstance(years, str): years = [years]

                questions.append(NeetPYQQuestion(
                    id=qid,
                    question=display_content,
                    options=options_list,
                    years_appeared=years
                ))
                seen_ids.add(qid)

        return NeetPYQResponse(status="success", count=len(questions), questions=questions)

    except Exception as e:
        logger.error(f"Postgres question retrieval failed: {e}")
        return NeetPYQResponse(status="error", count=0, questions=[])

        return NeetPYQResponse(status="success", count=len(questions), questions=questions)

    except Exception as e:
        logger.error(f"Vector search questions failed: {e}")
        return NeetPYQResponse(status="error", count=0, questions=[])

@router.get("/content/{topic_id}")
async def get_learning_content(topic_id: str, curriculum: str = "NEET", limit: int = 15, subject_id: Optional[str] = None, subtopic_name: Optional[str] = None):
    """
    Robust learning content retrieval from PostgreSQL (ai-books.curriculum_chunks).
    """
    try:
        curriculum_upper = curriculum.upper()
        query_text = subtopic_name or await resolve_topic_name(topic_id)
        
        chunks = []
        async with main_engine.connect() as conn:
            # Query by subtopic_id (if topic_id is subtopic) or topic_id
            # For simplicity, we search curriculum_chunks where subtopic_id matches
            res = await conn.execute(
                text("""
                    SELECT id, content, metadata 
                    FROM "ai-books".curriculum_chunks 
                    WHERE subtopic_id = :tid 
                    LIMIT :limit
                """),
                {"tid": topic_id, "limit": limit}
            )
            rows = res.mappings().all()
            for row in rows:
                raw_content = row["content"] or ""
                cleaned_content = clean_img_placeholders(raw_content)
                chunks.append({
                    "id": str(row["id"]),
                    "content": cleaned_content,
                    "metadata": row["metadata"] or {}
                })
        
        llm_context = format_llm_context(chunks) if chunks else ""
        
        return {
            "status": "success",
            "query": query_text,
            "chunks": chunks,
            "llm_context": llm_context,
            "curriculum": curriculum_upper
        }

        # 4. Final response construction
        llm_context = format_llm_context(chunks) if chunks else ""
        
        return {
            "status": "success",
            "query": query_text,
            "chunks": chunks,
            "llm_context": llm_context,
            "curriculum": curriculum_upper
        }

    except Exception as e:
        logger.error(f"Critical error in get_learning_content: {traceback.format_exc()}")
        return {"status": "error", "message": str(e), "chunks": []}

@router.post("/evaluate")
async def evaluate_answer(req: EvaluateAnswerRequest):
    """
    Evaluate student answer.
    If MCQ (selected_option), check against Postgres.
    """
    if req.selected_option and req.question_id:
        try:
            async with main_engine.connect() as conn:
                res = await conn.execute(
                    text('SELECT metadata, content FROM "ai-books".curriculum_chunks WHERE id = :qid'),
                    {"qid": req.question_id}
                )
                row = res.mappings().first()
                if row:
                    meta = row["metadata"] or {}
                    full_text = str(row["content"] or "")
                    
                    correct_answer = extract_correct_answer_util(full_text, meta)
                    
                    # Extract Solution part
                    solution_text = ""
                    stop_markers = ["Solution:", "Explanation:", "Answer:", "Correct Answer:"]
                    for marker in stop_markers:
                        if marker in full_text:
                            solution_text = full_text.split(marker, 1)[1].strip()
                            break
                    
                    # Normalize selected_option (e.g., "A: Meristem" -> "A")
                    selected = req.selected_option.split(":")[0].strip().upper() if ":" in req.selected_option else req.selected_option.strip().upper()
                    
                    is_correct = (selected == correct_answer) if correct_answer else False
                    return {
                        "status": "success",
                        "is_correct": is_correct,
                        "feedback": f"The correct answer is {correct_answer}." if correct_answer else "Correct answer not found in our database.",
                        "correct_answer": correct_answer,
                        "solution_text": solution_text
                    }
        except Exception as e:
            logger.error(f"MCQ evaluation error: {e}")
            traceback.print_exc()
    
    return {
        "status": "error",
        "message": "Evaluation failed or not supported in this mode."
    }

@router.post("/finish", response_model=FinishTestResponse)
async def finish_practice_test(req: FinishTestRequest):
    """
    Evaluate all answers at once, save report to DB, and return results.
    """
    results = []
    correct_count = 0
    total = len(req.answers)
    
    try:
        if not pyq_engine:
            raise HTTPException(status_code=500, detail="PYQ database engine not initialized")
            
        from db.postgres_client import engine as main_engine
        
        # 1. Process evaluation and build result set
        async with main_engine.connect() as conn:
            # 1. Create Test Report ID
            report_id = str(uuid.uuid4())
            
            for ans in req.answers:
                # Fetch question data from main consolidated engine
                res = await conn.execute(
                    text('SELECT metadata, content, subtopic_id FROM "ai-books".curriculum_chunks WHERE id = :qid'),
                    {"qid": ans.question_id}
                )
                row = res.mappings().first()
                if not row:
                    logger.warning(f"Question {ans.question_id} not found during finish")
                    continue
                
                meta = row["metadata"] or {}
                full_text = str(row["content"] or "")
                subtopic_id = row["subtopic_id"]
                
                # Extract options
                options_list = extract_options_util(full_text, meta)
                
                correct_option = extract_correct_answer_util(full_text, meta)
                
                # LLM Fallback if answer is missing
                if not correct_option:
                    logger.info(f"Answer missing for {ans.question_id}, falling back to LLM solver...")
                    correct_option = await get_llm_answer(full_text, options_list)
                    if correct_option:
                        logger.info(f"LLM solved {ans.question_id} as {correct_option}")
                
                # Extract solution
                solution_text = ""
                stop_markers = ["Solution:", "Explanation:", "Answer:", "Correct Answer:"]
                for marker in stop_markers:
                    if marker in full_text:
                        solution_text = full_text.split(marker, 1)[1].strip()
                        break
                
                # Normalize selected
                selected = ""
                if ans.selected_option:
                    selected = ans.selected_option.split(":")[0].strip().upper() if ":" in ans.selected_option else ans.selected_option.strip().upper()
                
                is_correct = (selected == correct_option) if correct_option else False
                if is_correct:
                    correct_count += 1
                
                # Extract years appeared
                years = meta.get("question_data", {}).get("years_appeared", [])
                if not years:
                    years = meta.get("years_appeared", [])
                if isinstance(years, str): years = [years]
                
                results.append(TestResultItem(
                    question_id=str(ans.question_id),
                    question_text=full_text.split(solution_text)[0].strip() if solution_text else full_text,
                    options=options_list,
                    is_correct=is_correct,
                    correct_option=correct_option,
                    solution_text=solution_text,
                    selected_option=selected,
                    years_appeared=years
                ))
                
        # 2. Save results to Main DB
        async with main_engine.connect() as conn:
            # Create Test Report ID
            report_id = str(uuid.uuid4())
            
            # 2a. Save Final Report FIRST (Parent)
            await conn.execute(
                text("""
                    INSERT INTO user_test_reports (id, user_id, curriculum, subject_id, chapter_id, topic_id, score, total_questions, created_at)
                    VALUES (:id, :uid, :curr, :sid, :cid, :tid, :score, :total, :ca)
                """),
                {
                    "id": report_id,
                    "uid": req.user_id,
                    "curr": req.curriculum,
                    "sid": req.subject_id,
                    "cid": req.chapter_id,
                    "tid": req.topic_id,
                    "score": correct_count,
                    "total": total,
                    "ca": datetime.utcnow()
                }
            )

            # 2b. Save Individual Answers (Children)
            for res_item in results:
                await conn.execute(
                    text("""
                        INSERT INTO user_test_answers (id, report_id, question_id, selected_option, correct_option, is_correct, time_taken_seconds)
                        VALUES (:id, :rid, :qid, :sel, :corr, :isc, :tt)
                    """),
                    {
                        "id": str(uuid.uuid4()),
                        "rid": report_id,
                        "qid": res_item.question_id,
                        "sel": res_item.selected_option,
                        "corr": res_item.correct_option,
                        "isc": res_item.is_correct,
                        "tt": 0 
                    }
                )
                
                if not res_item.is_correct and subtopic_id:
                    await conn.execute(
                        text("""
                            INSERT INTO user_mistake_tracking (id, user_id, subtopic_id, question_id, mistake_type, created_at)
                            VALUES (:id, :uid, :sid, :qid, :mt, :ca)
                        """),
                        {
                            "id": str(uuid.uuid4()),
                            "uid": req.user_id,
                            "sid": str(subtopic_id),
                            "qid": res_item.question_id,
                            "mt": MistakeType.conceptual.value,
                            "ca": datetime.utcnow()
                        }
                    )
            
            await conn.commit()
            
            return FinishTestResponse(
                status="success",
                report_id=report_id,
                score=correct_count,
                total=total,
                results=results
            )

    except Exception as e:
        logger.error(f"Finish test error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
