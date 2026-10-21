"""Alkalmazás-gyár: blueprintek, biztonsági fejlécek, hibakezelők."""
from flask import Flask, jsonify, request, send_from_directory

from . import db, security
from .config import PUBLIC_DIR


def create_app():
    app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024
    db.init()

    from .blueprints.auth import bp as auth_bp
    from .blueprints.data import bp as data_bp
    from .blueprints.prefs import bp as prefs_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(prefs_bp)

    @app.before_request
    def _guard():
        if request.path.startswith("/api/"):
            return security.csrf_check()

    @app.after_request
    def _headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        )
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        elif request.path.endswith((".html", "/")):
            resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/api/health")
    def health():
        return jsonify(ok=True)

    @app.errorhandler(404)
    def _nf(e):
        if request.path.startswith("/api/"):
            return jsonify(error="Nem található"), 404
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(413)
    def _big(e):
        return jsonify(error="Túl nagy kérés"), 413

    @app.errorhandler(500)
    def _err(e):
        return jsonify(error="Szerverhiba"), 500

    security.purge_expired()
    return app
