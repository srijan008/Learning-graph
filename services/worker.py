import os
import json
from arq.connections import RedisSettings
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

# We expect a REDIS_URL in the .env like: redis://localhost:6379/0
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

async def grade_subjective_question(ctx, user_id: str, subtopic_id: str, question_data: dict, user_answer: str):
    """
    Background task to invoke Gemini, evaluate the answer, and update Postgres.
    """
    print(f"[{ctx['job_id']}] Grading subjective question for User: {user_id}, Subtopic: {subtopic_id}")
    
    # 1. Initialize Gemini API Client
    service_account_path = os.getenv("GEMINI_SERVICE_ACCOUNT_PATH")
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "onboarding-bot-458509")
    
    if service_account_path and os.path.exists(service_account_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
        gemini_client = genai.Client(vertexai=True, project=project_id, location="us-central1")
    else:
        gemini_client = genai.Client()
        
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    
    # 2. Prompt Gemini
    prompt = f"""
You are an expert educational evaluator.
The user was asked the following question:
{json.dumps(question_data, indent=2)}

The user provided the following answer:
"{user_answer}"

Evaluate the user's answer for correctness. If it is incorrect, categorize the primary mistake as one of: [conceptual, calculation, reading_error, other].
Return ONLY a JSON response with this strict format:
{{"is_correct": true/false, "mistake_type": "string or null"}}
"""
    try:
        response = gemini_client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        # Parse response
        clean_text = response.text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:-3]
        
        result = json.loads(clean_text)
        is_correct = result.get("is_correct", False)
        mistake_type = result.get("mistake_type")
        
    except Exception as e:
        print(f"Error calling Gemini or parsing: {e}")
        is_correct = False
        mistake_type = "other"

    # 3. Update Postgres
    from db.postgres_client import async_session_maker
    from db.postgres_models import UserMistakeTracking, MistakeType, UserSubtopicProgress, SubtopicStatus
    from sqlalchemy import select
    
    async with async_session_maker() as db:
        if not is_correct:
            # Safely map to enum
            m_type = MistakeType.other
            try:
                if mistake_type:
                    m_type = MistakeType(mistake_type.lower())
            except ValueError:
                pass
                
            mistake = UserMistakeTracking(
                user_id=user_id,
                subtopic_id=subtopic_id,
                question_id=question_data.get("id", "unknown"),
                mistake_type=m_type
            )
            db.add(mistake)
        else:
            # If completely correct, try to mark as completed. (Or threshold based)
            res = await db.execute(
                select(UserSubtopicProgress)
                .where(UserSubtopicProgress.user_id == user_id, UserSubtopicProgress.subtopic_id == subtopic_id)
            )
            progress = res.scalars().first()
            if progress:
                progress.status = SubtopicStatus.completed
            else:
                progress = UserSubtopicProgress(
                    user_id=user_id,
                    subtopic_id=subtopic_id,
                    status=SubtopicStatus.completed
                )
                db.add(progress)
                
        await db.commit()

    print(f"[{ctx['job_id']}] Done grading. is_correct={is_correct}")
    return {"status": "graded", "is_correct": is_correct, "mistake_type": mistake_type}

class WorkerSettings:
    """
    Configuration for the arq worker.
    To run this worker use `arq services.worker.WorkerSettings`
    """
    functions = [grade_subjective_question]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)

async def get_redis_pool():
    from arq import create_pool
    return await create_pool(RedisSettings.from_dsn(REDIS_URL))
