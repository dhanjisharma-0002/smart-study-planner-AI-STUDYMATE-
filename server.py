"""
Smart Study Planner - Secure Backend Server & LLM Bridge
Serves static frontend assets and securely interfaces with LLM APIs (Gemini / OpenAI).
No API keys are exposed to the client; all secrets are read strictly from environment variables.
Falls back safely to local deterministic generation when no API key is configured.
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 3000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class StudyPlannerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/llm-status":
            self.handle_llm_status()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/generate-plan":
            self.handle_generate_plan()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_llm_status(self):
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
                else "No LLM credentials found in environment. Set GEMINI_API_KEY to enable cloud LLM generation."
            ),
        }
        self.send_json_response(200, response_data)

    def handle_generate_plan(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            self.send_json_response(400, {"success": False, "error": f"Invalid JSON body: {str(e)}"})
            return

        tasks = body.get("tasks", [])
        available_hours = float(body.get("availableHours", 4.0))

        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

        if not gemini_key and not openai_key:
            # Honestly report that no LLM credential is configured in the environment
            self.send_json_response(200, {
                "success": False,
                "llmConfigured": False,
                "error": "No LLM API key detected in server environment. Please set GEMINI_API_KEY in the environment.",
                "fallbackRequired": True,
                "engine": "deterministic_fallback"
            })
            return

        # If GEMINI_API_KEY is available, call the Gemini API securely
        if gemini_key:
            try:
                plan_result = self.call_gemini_api(gemini_key, tasks, available_hours)
                self.send_json_response(200, {
                    "success": True,
                    "llmConfigured": True,
                    "provider": "gemini",
                    "plan": plan_result,
                    "engine": "llm_gemini"
                })
            except Exception as e:
                self.send_json_response(200, {
                    "success": False,
                    "llmConfigured": True,
                    "error": f"Gemini API request failed: {str(e)}",
                    "fallbackRequired": True,
                    "engine": "deterministic_fallback"
                })
            return

        # If OPENAI_API_KEY is available, call OpenAI API securely
        if openai_key:
            try:
                plan_result = self.call_openai_api(openai_key, tasks, available_hours)
                self.send_json_response(200, {
                    "success": True,
                    "llmConfigured": True,
                    "provider": "openai",
                    "plan": plan_result,
                    "engine": "llm_openai"
                })
            except Exception as e:
                self.send_json_response(200, {
                    "success": False,
                    "llmConfigured": True,
                    "error": f"OpenAI API request failed: {str(e)}",
                    "fallbackRequired": True,
                    "engine": "deterministic_fallback"
                })
            return

    def call_gemini_api(self, api_key, tasks, available_hours):
        prompt = (
            f"You are the Smart Study Planner Engine. Given the following active tasks and a daily study capacity of {available_hours} hours ({int(available_hours * 60)} minutes):\n"
            f"Tasks: {json.dumps(tasks, indent=2)}\n\n"
            "Requirements:\n"
            "1. Schedule higher-priority and nearer-deadline tasks first.\n"
            "2. Never schedule tasks after their deadlines.\n"
            "3. Do not exceed the available daily study time.\n"
            "4. Split tasks into positive focus sessions (45-60 min each) only when necessary.\n"
            "5. Return ONLY a valid JSON object with this exact structure:\n"
            "{\n"
            '  "scheduledBlocks": [\n'
            '    {\n'
            '      "taskId": "task-id",\n'
            '      "subject": "Task Name",\n'
            '      "start": "09:00",\n'
            '      "end": "09:50",\n'
            '      "duration": 50,\n'
            '      "priority": "high",\n'
            '      "type": "study",\n'
            '      "deadline": "2026-10-18T14:00"\n'
            "    }\n"
            "  ],\n"
            '  "unscheduledTasks": [\n'
            '    {\n'
            '      "taskId": "task-id",\n'
            '      "subject": "Task Name",\n'
            '      "reason": "Explicit reason why it could not fit today"\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )

        req_payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"response_mime_type": "application/json"}
        }

        candidate_models = [
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemini-flash-latest"
        ]

        last_error = None
        for model in candidate_models:
            model_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            req = urllib.request.Request(
                model_url,
                data=json.dumps(req_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidate = data.get("candidates", [])[0]
                    text = candidate["content"]["parts"][0]["text"]
                    return json.loads(text)
            except urllib.error.HTTPError as e:
                last_error = e
                if e.code in (404, 503, 429):
                    continue
                raise
            except Exception as e:
                last_error = e
                continue

        if last_error:
            raise last_error
        raise RuntimeError("No candidate Gemini models succeeded")

    def call_openai_api(self, api_key, tasks, available_hours):
        url = "https://api.openai.com/v1/chat/completions"
        prompt = (
            f"You are the Smart Study Planner Engine. Daily available study time: {available_hours} hours.\n"
            f"Tasks: {json.dumps(tasks, indent=2)}\n"
            "Generate a realistic schedule in JSON format strictly following the schema with scheduledBlocks and unscheduledTasks."
        )

        req_payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(req_payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)

    def send_json_response(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server_address = ("", PORT)
    httpd = http.server.HTTPServer(server_address, StudyPlannerHandler)
    print(f"Smart Study Planner server running securely on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()
