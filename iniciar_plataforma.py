from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import webbrowser
import threading

BASE = Path(__file__).resolve().parent
os.chdir(BASE)
PORT = 8000
url = f"http://localhost:{PORT}"
threading.Timer(1.0, lambda: webbrowser.open(url)).start()
print(f"Plataforma Lega disponível em {url}")
print("Para encerrar, pressione Ctrl+C.")
ThreadingHTTPServer(("", PORT), SimpleHTTPRequestHandler).serve_forever()
