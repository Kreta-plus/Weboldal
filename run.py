"""KRÉTA Plusz indítófájl.

    pip install -r requirements.txt
    python run.py

Aztán: http://localhost:3000
"""
from kreta_plusz import create_app

app = create_app()

if __name__ == "__main__":
    # Csak a saját gépedről érhető el. Ne tedd ki az internetre HTTPS nélkül.
    app.run(host="127.0.0.1", port=3000, debug=False, threaded=True)
