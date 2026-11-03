"""Írási műveletek végpontjai: előnézet (még nem ír), majd jóváhagyás (egyszer használható token)."""
from flask import Blueprint, g, jsonify, request

from .. import ops, providers, security
from ..kreta_client import KretaError
from ..providers import NotSupported

bp = Blueprint("ops", __name__, url_prefix="/api/ops")


@bp.post("/preview")
@security.login_required
def preview():
    d = request.get_json(silent=True) or {}
    try:
        return jsonify(ops.preview(g.user["id"], providers.for_user(g.user), str(d.get("op", "")), d.get("payload")))
    except ops.OpError as e:
        return jsonify(error=e.msg), e.status
    except NotSupported as e:
        return jsonify(error=e.msg, code="todo"), 501
    except KretaError as e:
        return jsonify(error=e.msg, code=e.code), e.status


@bp.post("/commit")
@security.login_required
def commit():
    d = request.get_json(silent=True) or {}
    try:
        return jsonify(ops.commit(g.user["id"], providers.for_user(g.user), d.get("token")))
    except ops.OpError as e:
        return jsonify(error=e.msg), e.status
    except KretaError as e:
        return jsonify(error=e.msg, code=e.code), e.status
