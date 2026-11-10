"""GlitchTip hibakövetés (Sentry SDK-val): a szerverhibák maguktól, a bejelentések kézzel mennek ki.

Adatvédelem: a kérés törzse (jegyek, mulasztások, KRÉTA-jelszó), a sütik, a lekérdezési paraméterek
(diák- és csoportazonosítók), a helyi változók (tokenek) és a Discord webhook címe soha nem kerülnek a jelentésbe.
"""
import re

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

from .config import GLITCHTIP_DSN, GLITCHTIP_ENV

enabled = False


def _scrub(event, hint):
    req = event.get("request")
    if req:
        for k in ("data", "cookies", "query_string"):
            req.pop(k, None)
    return event


# a Discord webhook címe titok; a KRÉTA-hívások címéből a lekérdezési rész (diákazonosítók) kimarad
_HOOK = re.compile(r"(/api/webhooks/)[^\s\"'?#]+")


def _hide(v):
    return _HOOK.sub(r"\1[rejtve]", v.split("?", 1)[0]) if isinstance(v, str) else v


def _crumb(crumb, hint):
    data = crumb.get("data")
    if isinstance(data, dict):
        data.pop("http.query", None)
        if "url" in data:
            data["url"] = _hide(data["url"])
    return crumb


def _scrub_tx(event, hint):
    for span in event.get("spans") or []:
        if "description" in span:
            span["description"] = _hide(span["description"])
        if isinstance(span.get("data"), dict):
            span["data"].pop("http.query", None)
            if "url" in span["data"]:
                span["data"]["url"] = _hide(span["data"]["url"])
    return _scrub(event, hint)


def init():
    global enabled
    if not GLITCHTIP_DSN or enabled:
        return
    sentry_sdk.init(
        dsn=GLITCHTIP_DSN,
        environment=GLITCHTIP_ENV,
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.01,
        auto_session_tracking=False,  # a GlitchTip nem kezel sessionöket
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        before_send=_scrub,
        before_breadcrumb=_crumb,
        before_send_transaction=_scrub_tx,
    )
    enabled = True
