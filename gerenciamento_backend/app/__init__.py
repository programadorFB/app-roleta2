from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from dotenv import load_dotenv
import os

db = SQLAlchemy()
migrate = Migrate()


def create_app(config_name=None):
    load_dotenv()
    app = Flask(__name__)

    config_name = config_name or os.getenv('FLASK_ENV', 'production')
    from .config import config
    app.config.from_object(config.get(config_name, config['default']))

    # Sem CORS: o Express gateway é o único cliente e roda no mesmo cluster.
    # Browsers nunca atingem este backend diretamente.

    db.init_app(app)
    migrate.init_app(app, db)

    # Importa models antes de registrar rotas para o Alembic enxergá-los
    from . import models  # noqa: F401
    from .routes import main
    app.register_blueprint(main)

    return app
