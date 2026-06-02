"""WSGI entrypoint para gunicorn.

Usage: gunicorn -b 0.0.0.0:5004 wsgi:app
"""

import os
from app import create_app

config_name = os.getenv('FLASK_ENV', 'production')
app = create_app(config_name)
