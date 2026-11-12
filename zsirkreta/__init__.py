"""Alkalmazás-gyár: blueprintek, biztonsági fejlécek, hibakezelők."""
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from . import db, monitoring, security, site
from .config import PUBLIC_DIR, TRUST_PROXY


def create_app():
    monitoring.init()  # a Flask app előtt, hogy a Flask-integráció rákapcsolódjon
    app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024
    if TRUST_PROXY:  # a proxy mögötti valódi IP (belépési korlát), HTTPS (Secure süti) és host (CSRF-ellenőrzés)
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=TRUST_PROXY, x_proto=TRUST_PROXY, x_host=TRUST_PROXY)
    db.init()

    from .blueprints.auth import bp as auth_bp
    from .blueprints.contact import bp as contact_bp
    from .blueprints.data import bp as data_bp
    from .blueprints.feedback import bp as feedback_bp
    from .blueprints.prefs import bp as prefs_bp
    from .blueprints.site import bp as site_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(contact_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(feedback_bp)
    app.register_blueprint(prefs_bp)
    app.register_blueprint(site_bp)

    # karbantartás közben is működik: belépés, a nyilvános oldalbeállítások és az állapotjelző
    open_paths = ("/api/auth/", "/api/site", "/api/health")

    @app.before_request
    def _guard():
        if request.path.startswith("/api/"):
            bad = security.csrf_check()
            if bad or request.path.startswith(open_paths):
                return bad
            s = site.get()
            if site.maintenance_status(s) == "active" and not security.is_admin(security.load_session()):
                return jsonify(error=s["maintenanceText"], code="maintenance"), 503

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
        elif request.path.endswith((".html", ".js", ".css", "/", "/aszf")):
            resp.headers["Cache-Control"] = "no-cache"
        return security.save_session(resp)  # belépés, token-megújítás: a munkamenet sütije

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/aszf")
    def terms():
        return send_from_directory(app.static_folder, "aszf.html")

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
