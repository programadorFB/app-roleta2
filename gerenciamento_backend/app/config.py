"""Configuração do gerenciamento_backend.

Sem CORS, sem auth próprio. Confia em GATEWAY_SECRET vindo do roleta3.
"""

import os


class Config:
    # === DATABASE ===
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:1234@localhost:5432/betting_tracker',
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_size': int(os.getenv('DB_POOL_SIZE', '10')),
        'max_overflow': int(os.getenv('DB_POOL_MAX_OVERFLOW', '20')),
        'pool_timeout': 30,
    }

    # === GATEWAY (auth via header HMAC) ===
    # Mesma string deve estar em GATEWAY_SECRET no roleta3 backend
    GATEWAY_SECRET = os.getenv('GATEWAY_SECRET', '')

    # === API metadata ===
    API_VERSION = os.getenv('API_VERSION', 'v1')

    # === Logging ===
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

    @staticmethod
    def init_app(app):
        pass


class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = 'DEBUG'


class TestingConfig(Config):
    TESTING = True
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': ProductionConfig,
}
