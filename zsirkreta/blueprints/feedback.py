"""Hibabejelentés: a felhasználó szövege (és kérésre a technikai adatok) a GlitchTipbe kerül."""
import uuid

import sentry_sdk
from flask import Blueprint, jsonify, request

from .. import demo, monitoring, security

bp = Blueprint("feedback", __name__, url_prefix="/api/feedback")

MAX_REPORTS = 5  # ennyi bejelentés ...
WINDOW = 3600    # ... óránként, IP-nként


def _s(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


@bp.post("")
def report():
    if not monitoring.enabled:
        return jsonify(error="A hibabejelentés most nem elérhető"), 503
    d = request.get_json(silent=True) or {}
    text = _s(d.get("text"), 4000)
    if len(text) < 5:
        return jsonify(error="Írd le pár szóban, mi a hiba"), 400
    key = f"fb:{request.remote_addr or '?'}"
    if security.too_many_attempts(key, limit=MAX_REPORTS, window=WINDOW):
        return jsonify(error="Túl sok bejelentés, próbáld később", code="throttle"), 429
    security.record_attempt(key)

    user = security.load_session()
    with sentry_sdk.new_scope() as scope:
        scope.fingerprint = ["bugreport", uuid.uuid4().hex]  # minden bejelentés külön tétel
        scope.set_tag("kind", "bugreport")
        scope.set_tag("logged_in", bool(user))
        if user:
            scope.set_tag("demo", user["inst"] == demo.DEMO_INST)
            scope.set_user({"id": str(user["id"])})
        contact = _s(d.get("contact"), 120)
        scope.set_context("bugreport", {"text": text, "contact": contact or None})
        tech = d.get("tech") if isinstance(d.get("tech"), dict) else None
        if tech:
            errs = tech.get("errors")
            scope.set_tag("view", _s(tech.get("view"), 40) or "?")
            scope.set_context("browser_info", {
                "view": _s(tech.get("view"), 40),
                "path": _s(tech.get("path"), 200),
                "ua": (request.headers.get("User-Agent") or "")[:300],
                "screen": _s(tech.get("screen"), 40),
                "lang": _s(tech.get("lang"), 20),
                "theme": _s(tech.get("theme"), 20),
            })
            if isinstance(errs, list):
                scope.set_context("js_errors", {str(i): _s(e, 1500) for i, e in enumerate(errs[:10]) if isinstance(e, str)})
        title = text.splitlines()[0][:90]
        event_id = sentry_sdk.capture_message(f"Hibabejelentés: {title}", level="warning")
    return jsonify(ok=True, id=event_id)
