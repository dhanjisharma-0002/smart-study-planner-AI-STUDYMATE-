"""
Vercel Serverless Function: GET /api/llm-status
Reports whether an LLM API key (GEMINI_API_KEY / OPENAI_API_KEY) is configured
in the server-side environment. Secrets are NEVER exposed to the client.
"""

from http.server import BaseHTTPRequestHandler
import json
import os


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

        has_llm = bool(gemini_key or openai_key)
        provider = "gemini" if gemini_key else ("openai" if openai_key else None)

        response_data = {
            "llmAvailable": has_llm,
            "provider": provider,
            "message": (
                f"Active provider: {provider}"
                if has_llm
                else "No LLM credentials found in environment. Set GEMINI_API_KEY in Vercel to enable cloud LLM generation."
            ),
        }

        body = json.dumps(response_data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
