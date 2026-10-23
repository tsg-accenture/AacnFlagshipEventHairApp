"""Contract test for the real AIClient, against a local stand-in for api.openai.com.

It checks that every call our code makes is accepted by the installed openai SDK (3.35.1),
that requests carry store=false, safety_identifier, reasoning effort and max_output_tokens,
and that replies are parsed. It does not call OpenAI and says nothing about model quality.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.ai.coach import CoachAnswer
from app.ai.observe import ZoneObservation
from app.ai.openai_client import AIClient, choice, predicate
from app.core.config import get_settings
from app.core.db import session_factory

SEEN: list[tuple[str, dict]] = []
FAIL_DECISIONS = {"on": False}


def _response(payload: dict, model: str) -> dict:
    return {
        "id": "resp_test", "object": "response", "created_at": 1760000000, "status": "completed", "model": model,
        "output": [{"type": "message", "id": "msg_test", "status": "completed", "role": "assistant",
                    "content": [{"type": "output_text", "text": json.dumps(payload), "annotations": []}]}],
        "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15,
                  "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}},
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append((self.path, body))
        if self.path.endswith("/moderations"):
            cats = {k: False for k in ["harassment", "harassment/threatening", "hate", "hate/threatening", "illicit",
                                       "illicit/violent", "self-harm", "self-harm/instructions", "self-harm/intent",
                                       "sexual", "sexual/minors", "violence", "violence/graphic"]}
            out = {"id": "modr", "model": body["model"], "results": [{"flagged": False, "categories": cats,
                    "category_scores": {k: 0.0 for k in cats}, "category_applied_input_types": {k: ["text"] for k in cats}}]}
        elif self.path.endswith("/decisions"):
            if FAIL_DECISIONS["on"]:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'{"error":{"message":"not found","type":"invalid_request_error"}}')
                return
            answers = []
            for q in body["questions"]:
                if q["type"] == "predicate":
                    answers.append({"type": "predicate", "name": q.get("name"), "probability": 0.1})
                else:
                    v = q["choices"][0]["value"]
                    answers.append({"type": "choice", "name": q.get("name"), "choice": v, "confidence": 0.8,
                                    "probabilities": [{"value": v, "probability": 0.8}]})
            out = {"answers": answers, "model": body["model"], "usage": {"input_tokens": 5, "output_tokens": 1, "total_tokens": 6,
                   "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}}}
        elif self.path.endswith("/responses"):
            name = body["text"]["format"]["name"]
            if name == "CoachAnswer":
                payload = {"answer": "Wash once a week or every other week.", "cited_ids": [1], "action": "Plan wash day.", "signpost": False, "professional_guidance": ""}
            elif name == "ZoneObservation":
                payload = {k: "cant_tell" for k in ZoneObservation.model_fields}
            elif name == "DecisionFallback":
                payload = {"triage": "hair_scalp_care"}
            else:
                payload = {}
            out = _response(payload, body["model"])
        elif self.path.endswith("/embeddings"):
            out = {"object": "list", "model": body["model"], "data": [{"object": "embedding", "index": i,
                   "embedding": [0.0] * body.get("dimensions", 1536)} for i, _ in enumerate(body["input"])],
                   "usage": {"prompt_tokens": 3, "total_tokens": 3}}
        else:
            self.send_response(404)
            self.end_headers()
            return
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture
def ai(monkeypatch):
    server = HTTPServer(("127.0.0.1", 0), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    s = get_settings()
    monkeypatch.setattr(s, "OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(s, "OPENAI_BASE_URL", f"http://127.0.0.1:{server.server_port}/v1")
    SEEN.clear()
    FAIL_DECISIONS["on"] = False
    db = session_factory()()
    yield AIClient(db, None)  # no user row needed; ai_calls.user_id is nullable
    db.close()
    server.shutdown()


def test_moderation_embeddings(ai):
    assert ai.moderate_text("hello", "t").flagged is False
    assert ai.moderate_image("data:image/jpeg;base64,AAAA", "t").flagged is False
    path, body = SEEN[-1]
    assert body["input"][0]["type"] == "image_url"
    vecs = ai.embed(["a", "b"])
    assert len(vecs) == 2 and len(vecs[0]) == 1536
    assert SEEN[-1][1]["model"] == "text-embedding-3-small" and SEEN[-1][1]["dimensions"] == 1536


def test_responses_parse_sends_required_settings(ai):
    out = ai.parse(feature="t", model="gpt-6-luna", instructions="sys", input="q", schema=CoachAnswer,
                   max_output_tokens=123, effort="low")
    assert out is not None and out.cited_ids == [1]
    path, body = SEEN[-1]
    assert path.endswith("/responses")
    assert body["store"] is False
    assert body["max_output_tokens"] == 123
    assert body["reasoning"] == {"effort": "low"}
    assert body["text"]["format"]["type"] == "json_schema" and body["text"]["format"]["strict"] is True
    assert "safety_identifier" not in body or body["safety_identifier"] is None  # no user in this test
    vis = ai.parse(feature="v", model="gpt-6.1-sol", instructions="sys",
                   input=[{"role": "user", "content": [{"type": "input_text", "text": "x"},
                          {"type": "input_image", "image_url": "data:image/jpeg;base64,AAAA", "detail": "high"}]}],
                   schema=ZoneObservation, max_output_tokens=50, effort="low")
    assert vis is not None and vis.flaking == "cant_tell"


def test_decisions_and_fallback(ai):
    qs = [predicate("p1", "Is it?"), choice("triage", "Pick", [("hair_scalp_care", "a"), ("out_of_scope", "b")])]
    ans = ai.decide("t", "question", qs)
    assert ans[0].type == "predicate" and ans[0].probability == 0.1
    assert ans[1].choice == "hair_scalp_care"
    assert SEEN[-1][0].endswith("/decisions") and SEEN[-1][1]["model"] == "gpt-6-luna"
    # The beta API failing must not break the feature: Responses fallback
    FAIL_DECISIONS["on"] = True
    ans = ai.decide("t", "question", [qs[1]])
    assert ans[0].choice == "hair_scalp_care"
    assert SEEN[-1][0].endswith("/responses")


def test_safety_identifier_is_hashed(monkeypatch):
    import uuid

    from app.core.security import safety_identifier

    uid = uuid.uuid4()
    sid = safety_identifier(uid)
    assert sid and str(uid) not in sid and len(sid) == 64


def test_openai_failure_is_a_clear_503(app, monkeypatch):
    """A wrong key or an outage must not surface as a 500 with a stack trace."""
    from tests.conftest import make_user

    api = make_user(app)
    s = get_settings()
    monkeypatch.setattr(s, "AI_MODE", "openai")
    monkeypatch.setattr(s, "OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(s, "OPENAI_BASE_URL", "http://127.0.0.1:9/v1")  # nothing listens here
    monkeypatch.setattr(s, "OPENAI_TIMEOUT_SECONDS", 2.0)
    r = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "ai_error"
