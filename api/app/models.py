"""Модель даних. Одна міграція Alembic створює все з цього файлу."""

from __future__ import annotations

import datetime as dt

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

EMBED_DIM = 1024  # bge-m3


class Base(DeclarativeBase):
    type_annotation_map = {dict: JSONB, list: JSONB}


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(Text, unique=True)
    landing_url: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Enum("api", "landing", "both", name="product_source"))
    price: Mapped[float] = mapped_column(Float)
    old_price: Mapped[float | None] = mapped_column(Float)
    upsell_price: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[str | None] = mapped_column(Text)
    variant_label: Mapped[str | None] = mapped_column(Text)
    images: Mapped[list] = mapped_column(JSONB, default=list)
    category: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONB)
    extraction_confidence: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class ProductI18n(Base):
    __tablename__ = "product_i18n"
    __table_args__ = (UniqueConstraint("product_id", "lang"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    lang: Mapped[str] = mapped_column(Enum("uk", "pl", name="lang"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(
        Enum("source", "draft", "approved", name="i18n_status"), default="source")
    review_note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=now, onupdate=now)


class Page(Base):
    __tablename__ = "pages"
    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str | None] = mapped_column(Text)
    body_text: Mapped[str] = mapped_column(Text, default="")
    lang: Mapped[str] = mapped_column(Text, default="uk")
    raw_html_path: Mapped[str | None] = mapped_column(Text)


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    ref_type: Mapped[str] = mapped_column(Enum("product", "page", name="chunk_ref"))
    ref_id: Mapped[int] = mapped_column(Integer)
    lang: Mapped[str] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(Vector(EMBED_DIM))
    tsv_uk: Mapped[str | None] = mapped_column(TSVECTOR)
    tsv_pl: Mapped[str | None] = mapped_column(TSVECTOR)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[str] = mapped_column(Enum("web", name="conv_channel"), default="web")
    lang: Mapped[str] = mapped_column(Text, default="uk")
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(Text)  # user | assistant | human_agent
    content: Mapped[str] = mapped_column(Text)
    product_refs: Mapped[list | None] = mapped_column(JSONB)
    source_refs: Mapped[list | None] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(Enum("chat", "form", "review", name="ticket_source"))
    category: Mapped[str | None] = mapped_column(Text)
    sentiment: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="new")
    lang: Mapped[str] = mapped_column(Text, default="uk")
    draft_reply: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    phone_masked: Mapped[str] = mapped_column(Text)
    city: Mapped[str] = mapped_column(Text)
    orders_count: Mapped[int] = mapped_column(Integer, default=0)
    pickup_rate: Mapped[float] = mapped_column(Float, default=1.0)
    ltv: Mapped[float] = mapped_column(Float, default=0)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(Text, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    items: Mapped[list] = mapped_column(JSONB, default=list)
    total: Mapped[float] = mapped_column(Float)
    payment: Mapped[str] = mapped_column(Enum("cod", "card", name="payment_kind"))
    status: Mapped[str] = mapped_column(Text, default="pending")
    confirm_decision: Mapped[str | None] = mapped_column(
        Enum("auto", "call", "pending", name="confirm_kind"))
    confirm_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    np_status: Mapped[str] = mapped_column(Text)
    np_updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    days_waiting: Mapped[int] = mapped_column(Integer, default=0)
    reminders: Mapped[list] = mapped_column(JSONB, default=list)


class SyncLog(Base):
    __tablename__ = "sync_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    direction: Mapped[str] = mapped_column(
        Enum("tilda_to_1c", "one_c_to_tilda", name="sync_direction"))
    sku: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Enum("ok", "conflict", "skipped", name="sync_status"))
    detail: Mapped[str | None] = mapped_column(Text)
    resolution: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class Unanswered(Base):
    __tablename__ = "unanswered"
    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(Text)
    topic: Mapped[str | None] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


class EvalQuestion(Base):
    __tablename__ = "eval_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    lang: Mapped[str] = mapped_column(Text)
    question: Mapped[str] = mapped_column(Text)
    expected_refs: Mapped[list] = mapped_column(JSONB, default=list)


class EvalRun(Base):
    __tablename__ = "eval_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    p_at_5: Mapped[float | None] = mapped_column(Float)
    mrr: Mapped[float | None] = mapped_column(Float)
    judge_pass_rate: Mapped[float | None] = mapped_column(Float)
    report: Mapped[dict | None] = mapped_column(JSONB)


class ApiUsage(Base):
    """Лічильник реальних витрат LLM API — паливо для блоку Build vs Buy."""
    __tablename__ = "api_usage"
    id: Mapped[int] = mapped_column(primary_key=True)
    purpose: Mapped[str] = mapped_column(Text)  # chat | translate | agent | judge…
    model: Mapped[str] = mapped_column(Text)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
