"""資料庫：帳號、每次匯入的快照、案號對照表、站上的設定（評語、連結、自訂欄位）。"""
import datetime
import gzip
import json
import os

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

URL = os.environ.get("DATABASE_URL", "sqlite:///./data/case-vitals.db")
if URL.startswith("postgres://"):
    URL = URL.replace("postgres://", "postgresql+psycopg://", 1)
elif URL.startswith("postgresql://"):
    URL = URL.replace("postgresql://", "postgresql+psycopg://", 1)
if URL.startswith("sqlite:///./"):
    os.makedirs(os.path.dirname(URL.replace("sqlite:///", "")) or ".", exist_ok=True)
engine = create_engine(URL, pool_pre_ping=True)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    pw_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="viewer")


class KV(Base):
    __tablename__ = "kv"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class CaseId(Base):
    __tablename__ = "case_ids"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    display: Mapped[str] = mapped_column(String(20), unique=True)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    by: Mapped[str] = mapped_column(String(80), default="")
    as_of: Mapped[str] = mapped_column(String(10), default="")
    files: Mapped[str] = mapped_column(Text, default="{}")
    team_raw: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    creatives_raw: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    snapshot: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    diff: Mapped[str] = mapped_column(Text, default="{}")


def init():
    Base.metadata.create_all(engine)


def session():
    return Session(engine)


def pack(obj) -> bytes:
    return gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def unpack(blob):
    return json.loads(gzip.decompress(blob).decode("utf-8")) if blob else None


def kv_get(s, key, default=None):
    row = s.get(KV, key)
    return json.loads(row.value) if row else default


def kv_set(s, key, value):
    row = s.get(KV, key)
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if row:
        row.value = data
    else:
        s.add(KV(key=key, value=data))


def latest_run(s):
    return s.scalars(select(Run).where(Run.status == "applied").order_by(Run.id.desc()).limit(1)).first()
