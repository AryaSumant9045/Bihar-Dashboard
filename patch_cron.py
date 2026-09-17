import re

with open('app/api/cron/generate-insight/route.js', 'r') as f:
    content = f.read()

# Add waitUntil import
content = content.replace("import { GoogleGenAI } from '@google/genai';", "import { GoogleGenAI } from '@google/genai';\nimport { waitUntil } from '@vercel/functions';")

# Replace export async function GET(req) with async function runCronTask()
# Wait, the auth check needs the request object (specifically req.nextUrl and req.headers).
# It's better to keep the auth check in GET/POST and pass the rest to runCronTask.
