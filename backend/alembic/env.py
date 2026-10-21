"""Alembic environment: reads DATABASE_URL from backend/.env via app settings."""
from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  (registers tables on Base.metadata)
from app.core.config import get_settings
from app.core.db import Base, get_engine

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL.replace("%", "%%"))
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)  # keep the app's own loggers working

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"},
                      render_as_batch=url.startswith("sqlite"))
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # The app's own engine: for SQLite it also creates backend/var/ and switches on foreign keys.
    with get_engine().connect() as connection:
        # Batch mode lets later migrations alter tables on SQLite, which has limited ALTER TABLE.
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=connection.dialect.name == "sqlite")
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
