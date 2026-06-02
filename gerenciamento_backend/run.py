"""Entry point para o servidor Flask do gerenciamento.

Em produção é servido por gunicorn (`gunicorn run:app ...`). Localmente
pode ser rodado direto com `python run.py` para iteração rápida.
"""

import os
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

from dotenv import load_dotenv

_base = os.path.dirname(os.path.abspath(__file__))
for env_file in ('.env.dev', '.env'):
    path = os.path.join(_base, env_file)
    if os.path.exists(path):
        load_dotenv(path, override=True)
        break

from app import create_app  # noqa: E402

config_name = os.getenv('FLASK_ENV', 'production')
app = create_app(config_name)


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5004'))
    host = os.getenv('HOST', '0.0.0.0' if config_name == 'production' else '127.0.0.1')
    app.run(host=host, port=port, debug=app.config.get('DEBUG', False))
