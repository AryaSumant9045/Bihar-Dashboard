import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
try:
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    completion = groq_client.chat.completions.create(
        model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        messages=[{"role": "user", "content": "Test"}],
        temperature=0.5,
        max_tokens=10
    )
    print("Groq success!")
except Exception as e:
    print(f"Groq error: {e}")
