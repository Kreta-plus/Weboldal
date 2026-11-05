"""GlitchTip hibakövetés (Sentry SDK-val): a szerverhibák maguktól, a bejelentések kézzel mennek ki.

Adatvédelem: a kérés törzse (KRÉTA jelszó, belépési kód), a sütik és a helyi változók
(tokenek) soha nem kerülnek a jelentésbe.
"""
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
    )
    enabled = True
