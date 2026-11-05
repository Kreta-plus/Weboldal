"""ZsírKréta – tanári verzió, indítófájl.

    pip install -r ../requirements.txt
    python run.py

Aztán: http://localhost:3100
"""
from kreta_tanar import create_app

app = create_app()

if __name__ == "__main__":
    # Csak a saját gépedről érhető el. A tanári fiók sok diák adatához ad hozzáférést,
    # ezért ezt ne tedd ki az internetre.
    app.run(host="127.0.0.1", port=3100, debug=False, threaded=True)
