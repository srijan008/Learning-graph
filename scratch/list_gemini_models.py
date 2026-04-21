import os
from google import genai
from dotenv import load_dotenv

def list_models():
    load_dotenv()
    project_id = os.getenv('GOOGLE_CLOUD_PROJECT', 'onboarding-bot-458509')
    service_account_path = os.getenv('GEMINI_SERVICE_ACCOUNT_PATH')
    
    if service_account_path and os.path.exists(service_account_path):
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = service_account_path
        client = genai.Client(vertexai=True, project=project_id, location='us-central1')
    else:
        client = genai.Client()
    
    try:
        print(f"Listing models for project: {project_id}...")
        models = client.models.list()
        for m in models:
            print(f"- {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
