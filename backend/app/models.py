"""Database tables, following the plan's data model.

They run on SQLite (local development, nothing to install) and on Postgres with pgvector
(production). Every table that holds a user's data has user_id with ON DELETE CASCADE, so
deleting the account removes it. Stored photo files are removed by the account-deletion route.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")
EMBED_DIM = 1536


class UTCDateTime(TypeDecorator):
    """A timestamp that always comes back timezone-aware, in UTC.

    Postgres stores the timezone. SQLite doesn't, so values are written there as UTC and
    marked as UTC again when read. Without this, SQLite would hand back naive datetimes that
    can't be compared with datetime.now(timezone.utc).
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        return value if dialect.name == "postgresql" else value.replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class Embedding(TypeDecorator):
    """A library embedding: pgvector's VECTOR on Postgres, a JSON list of floats elsewhere.

    On Postgres, search runs in the database (cosine distance). On SQLite, app/library.py
    compares the vectors in Python, which is quick for a library of this size.
    """

    impl = Vector
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.impl.dim))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None or dialect.name == "postgresql":
            return value
        return [float(x) for x in value]


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> uuid.UUID:
    return uuid.uuid4()


def user_fk() -> Any:
    return mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)


# ---------- Account ----------


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | advisor
    adult_confirmed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class SessionToken(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class ConsentEvent(Base):
    """Append-only ledger. The current state of a consent is its latest event."""

    __tablename__ = "consent_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    consent_type: Mapped[str] = mapped_column(String(40))  # analysis | photo_retention | sharing | reminders
    granted: Mapped[bool] = mapped_column(Boolean)
    wording_version: Mapped[str] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(40), default="settings")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    route: Mapped[str | None] = mapped_column(String(20))  # routine | concern | questions
    data: Mapped[dict] = mapped_column(JSONType, default=dict)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, onupdate=now)


class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    title: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(30))  # moisture | breakage | edges | length | scalp | other
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | reached | paused
    milestones: Mapped[list] = mapped_column(JSONType, default=list)  # [{date, note}]
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    kind: Mapped[str] = mapped_column(String(40))  # get_checked
    due_at: Mapped[datetime] = mapped_column(UTCDateTime())
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | done | dismissed
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


# ---------- Rhythm and diary ----------


class StylePeriod(Base):
    __tablename__ = "style_periods"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    style_name: Mapped[str] = mapped_column(String(80))
    style_kind: Mapped[str] = mapped_column(String(30))  # braids | twists | locs | wig | weave | cornrows | natural | other
    stage: Mapped[str] = mapped_column(String(20), default="wear")  # install | wear | take_down | rest | ended
    install_date: Mapped[date] = mapped_column(Date)
    take_down_planned: Mapped[date | None] = mapped_column(Date)
    take_down_date: Mapped[date | None] = mapped_column(Date)
    rest_until: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class CheckIn(Base):
    __tablename__ = "checkins"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    style_period_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("style_periods.id", ondelete="SET NULL"), index=True
    )
    template: Mapped[str] = mapped_column(String(30))
    tightness: Mapped[str | None] = mapped_column(String(20))
    soreness: Mapped[str | None] = mapped_column(String(20))
    bumps: Mapped[str | None] = mapped_column(String(20))
    itch: Mapped[str | None] = mapped_column(String(20))
    edges: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)
    day_in_style: Mapped[int | None] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(30))
    rule_ids: Mapped[list] = mapped_column(JSONType, default=list)
    rules_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


# ---------- Assessment ----------


class Assessment(Base):
    __tablename__ = "assessments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    kind: Mapped[str] = mapped_column(String(20), default="check")  # check | take_down
    style_period_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("style_periods.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | done
    rules_version: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    zones: Mapped[list["AssessmentZone"]] = relationship(cascade="all, delete-orphan", order_by="AssessmentZone.position")


class AssessmentZone(Base):
    __tablename__ = "assessment_zones"
    __table_args__ = (UniqueConstraint("assessment_id", "zone"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    zone: Mapped[str] = mapped_column(String(20))
    position: Mapped[int] = mapped_column(Integer, default=0)
    answers: Mapped[dict] = mapped_column(JSONType, default=dict)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    zone: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str | None] = mapped_column(String(255))  # None once the file is deleted
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    quality: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    file_deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    photo_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("photos.id", ondelete="SET NULL"))
    zone: Mapped[str] = mapped_column(String(20))
    data: Mapped[dict] = mapped_column(JSONType)
    model: Mapped[str] = mapped_column(String(80))
    prompt_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class ZoneState(Base):
    __tablename__ = "zone_states"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    zone: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(20))  # calm | watch | get_checked | not_checked
    reasons: Mapped[list] = mapped_column(JSONType, default=list)
    rule_ids: Mapped[list] = mapped_column(JSONType, default=list)
    rules_version: Mapped[str] = mapped_column(String(40))
    explanation: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


# ---------- Content ----------


class LibraryArticle(Base):
    __tablename__ = "library_articles"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    body_md: Mapped[str] = mapped_column(Text)
    topics: Mapped[list] = mapped_column(JSONType, default=list)
    sources: Mapped[list] = mapped_column(JSONType, default=list)  # [{name, url}]
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | reviewed | retired
    reviewer: Mapped[str | None] = mapped_column(String(120))
    review_date: Mapped[date | None] = mapped_column(Date)
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, onupdate=now)
    chunks: Mapped[list["LibraryChunk"]] = relationship(cascade="all, delete-orphan", order_by="LibraryChunk.idx")


class LibraryChunk(Base):
    __tablename__ = "library_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    article_id: Mapped[str] = mapped_column(String(80), ForeignKey("library_articles.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Embedding(EMBED_DIM))
    embedding_model: Mapped[str] = mapped_column(String(80))


class RulesVersion(Base):
    __tablename__ = "rules_versions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    version: Mapped[str] = mapped_column(String(40), unique=True)
    yaml_text: Mapped[str] = mapped_column(Text)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


# ---------- Outputs ----------


class CarePlan(Base):
    __tablename__ = "care_plans"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    data: Mapped[dict] = mapped_column(JSONType)
    intro: Mapped[str] = mapped_column(Text, default="")
    intro_source: Mapped[str] = mapped_column(String(20), default="template")  # template | ai
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


class CoachMessage(Base):
    __tablename__ = "coach_messages"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    question: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(30))  # answer | no_reviewed_answer | out_of_scope | see_someone_now | support
    answer: Mapped[dict] = mapped_column(JSONType, default=dict)
    cited_chunk_ids: Mapped[list] = mapped_column(JSONType, default=list)
    model: Mapped[str | None] = mapped_column(String(80))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


class CarePack(Base):
    __tablename__ = "care_packs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    contents: Mapped[dict] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class StylistNote(Base):
    __tablename__ = "stylist_notes"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = user_fk()
    item_ids: Mapped[list] = mapped_column(JSONType)
    text: Mapped[str] = mapped_column(Text)
    polished: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


# ---------- Operations ----------


class AICall(Base):
    """One row per OpenAI call: no photo, question text or health detail is stored here."""

    __tablename__ = "ai_calls"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    feature: Mapped[str] = mapped_column(String(40))
    endpoint: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(80))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
