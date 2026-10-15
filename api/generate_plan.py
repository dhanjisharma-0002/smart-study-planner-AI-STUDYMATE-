"""
Vercel Serverless Function: POST /api/generate-plan
Securely interfaces with Google Gemini LLM API using GEMINI_API_KEY from environment.
Never exposes API keys to client JavaScript or commits.
Falls back safely to local deterministic generation when uncredentialed.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
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
            self.send_json_response(200, {
                "success": False,
                "llmConfigured": False,
                "error": "No LLM API key detected in server environment. Please set GEMINI_API_KEY in Vercel environment variables.",
                "fallbackRequired": True,
                "engine": "deterministic_fallback"
            })
            return

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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

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
            '    }\n'
            '  ],\n'
            '  "unscheduledTasks": [\n'
            '    {\n'
            '      "taskId": "task-id",\n'
            '      "subject": "Task Name",\n'
            '      "reason": "Explicit reason why it could not fit today"\n'
            '    }\n'
            '  ]\n'
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
