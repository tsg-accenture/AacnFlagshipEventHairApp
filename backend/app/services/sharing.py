"""Care pack PDF (FR13) and stylist note (FR11). Nothing is sent anywhere: the person downloads or shares it."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as RLImage
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.content import load_yaml, zone_names
from app.models import CheckIn, Photo, Profile, StylePeriod, User
from app.services import consents, escalation

STATE_WORDS = {"calm": "Calm", "watch": "Watch", "get_checked": "Get checked", "not_checked": "Not checked"}
ANSWER_WORDS = {"none": "None", "a_little": "A little", "hurts": "Hurts", "a_few": "A few", "lots": "Lots",
                "a_lot": "A lot", "fine": "Fine", "not_sure": "Not sure", "thinner": "Thinner"}


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text), style)


def care_pack_pdf(db: Session, user: User, include_checkins: bool, include_zones: bool, photo_ids: list[str],
                  questions: list[str], note: str | None) -> tuple[bytes, dict]:
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontSize=18, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=13, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=14)
    small = ParagraphStyle("s", parent=body, fontSize=8.5, leading=11, textColor=colors.HexColor("#5F5650"))
    story: list = []
    names = zone_names()
    contents: dict = {"checkins": 0, "zones": [], "photos": [], "questions": len(questions)}

    story.append(_p("Crown AI care pack", h1))
    story.append(_p(f"Prepared {datetime.now(timezone.utc).strftime('%d %B %Y')} by {user.display_name or 'me'} to bring to an appointment.", body))
    story.append(_p("This is my own record from a hair-care app. It is not a diagnosis. Zone states come from written "
                    "rules that are still a draft awaiting clinical review.", small))

    profile = db.get(Profile, user.id)
    pdata = profile.data if profile else {}
    periods = db.scalars(select(StylePeriod).where(StylePeriod.user_id == user.id).order_by(StylePeriod.install_date.desc()).limit(6)).all()
    story.append(_p("Styles and treatments", h2))
    treat = ", ".join(pdata.get("treatments") or []) or "none recorded"
    story.append(_p(f"Heat or chemical treatments: {treat}.", body))
    if periods:
        rows = [["Style", "Installed", "Taken down"]]
        rows += [[p.style_name, p.install_date.isoformat(), (p.take_down_date or p.take_down_planned).isoformat() if (p.take_down_date or p.take_down_planned) else "-"] for p in periods]
        story.append(_table(rows, [70 * mm, 40 * mm, 40 * mm]))

    if note:
        story.append(_p("In my own words", h2))
        story.append(_p(note, body))

    health_ok = consents.has(db, user.id, "health_data")
    if (include_checkins or include_zones) and not health_ok:
        story.append(_p("Check-ins and Crown Map zones are left out because hair-health records are switched off in Settings.", small))
    include_checkins = include_checkins and health_ok
    include_zones = include_zones and health_ok

    if include_checkins:
        cis = db.scalars(select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()).limit(30)).all()
        contents["checkins"] = len(cis)
        story.append(_p("Check-ins (most recent first)", h2))
        if cis:
            rows = [["Date", "Style day", "Tight", "Sore", "Bumps", "Itch", "Edges"]]
            for c in cis:
                rows.append([c.created_at.strftime("%d %b %Y"), str(c.day_in_style or "-")] +
                            [ANSWER_WORDS.get(getattr(c, f) or "", "-") for f in ("tightness", "soreness", "bumps", "itch", "edges")])
            story.append(_table(rows, [26 * mm, 18 * mm, 22 * mm, 22 * mm, 20 * mm, 20 * mm, 22 * mm]))
            notes = [c for c in cis if c.note]
            for c in notes[:10]:
                story.append(_p(f"{c.created_at.strftime('%d %b %Y')}: {c.note}", small))
        else:
            story.append(_p("No check-ins yet.", body))
        pats = [h for h in escalation.all_hits(db, user) if h["source"] == "pattern"]
        for h in pats:
            story.append(_p(f"Pattern noticed: {h['reason']}", body))

    if include_zones:
        latest = escalation.latest_zone_states(db, user.id)
        story.append(_p("Crown Map zones", h2))
        rows = [["Zone", "State", "Why", "Date"]]
        for z in ["hairline", "left_temple", "right_temple", "crown", "nape"]:
            zs = latest.get(z)
            if zs:
                rows.append([names[z], STATE_WORDS[zs.state], "; ".join(zs.reasons), zs.created_at.strftime("%d %b %Y")])
                contents["zones"].append(z)
            else:
                rows.append([names[z], "Not checked", "-", "-"])
        story.append(_table(rows, [32 * mm, 26 * mm, 90 * mm, 24 * mm], wrap_style=small))

    if photo_ids:
        story.append(_p("Photos I chose to include", h2))
        for pid in photo_ids:
            ph = db.get(Photo, _uuid(pid))
            if ph is None or ph.user_id != user.id:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
            if not ph.storage_key:
                continue
            data = storage.load(ph.storage_key)
            ir = ImageReader(io.BytesIO(data))
            w, h = ir.getSize()
            width = 80 * mm
            img = RLImage(io.BytesIO(data), width=width, height=width * h / w)
            story.append(KeepTogether([img, _p(f"{names.get(ph.zone, ph.zone)}, {ph.created_at.strftime('%d %b %Y')}", small), Spacer(1, 6)]))
            contents["photos"].append(pid)

    if questions:
        story.append(_p("Questions I'd like to ask", h2))
        for q in questions:
            story.append(_p(f"• {q}", body))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title="Crown AI care pack", author=user.display_name or "Crown AI user")
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue(), contents


def _table(rows: list[list[str]], widths: list[float], wrap_style: ParagraphStyle | None = None) -> Table:
    if wrap_style is not None:
        rows = [rows[0]] + [[Paragraph(escape(str(c)), wrap_style) for c in r] for r in rows[1:]]
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1EEEB")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8AEA6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def _footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5F5650"))
    canvas.drawString(18 * mm, 10 * mm, "Crown AI gives general guidance and signposting. It does not diagnose.")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _uuid(v: str):
    import uuid

    try:
        return uuid.UUID(v)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found") from None


# ---------- Stylist note ----------


def stylist_items(db: Session, user: User) -> list[dict]:
    """Candidate sentences, each traceable to the person's own data or a standard request."""
    items = [
        {"id": "loose-edges", "text": "Please keep it loose around my edges and temples.", "why": "A standard request", "suggested": True},
        {"id": "tell-me", "text": "If you notice any thinning, breakage or bumps, please tell me.", "why": "A standard request", "suggested": True},
    ]
    periods = db.scalars(select(StylePeriod).where(StylePeriod.user_id == user.id)).all()
    if any(p.style_kind in ("braids", "twists", "cornrows", "locs") for p in periods):
        items.append({"id": "lighter-front", "text": "Smaller, lighter braids at the front, please.", "why": "You wear braided styles", "suggested": True})
    if not consents.has(db, user.id, "health_data"):
        return items  # nothing drawn from hair-health records without that consent
    sore_periods = set()
    any_ease = False
    for c in db.scalars(select(CheckIn).where(CheckIn.user_id == user.id)).all():
        if c.style_period_id and ("hurts" in (c.tightness, c.soreness) or "a_little" in (c.tightness, c.soreness)):
            sore_periods.add(c.style_period_id)
        any_ease = any_ease or c.outcome in ("ease_the_pull", "too_tight")
    if sore_periods:
        n = len(sore_periods)
        items.append({"id": "sore-history", "text": f"My scalp got sore after {'my last install' if n == 1 else f'my last {n} installs'}.",
                      "why": f"From your check-ins ({n} style{'s' if n != 1 else ''} with soreness or tightness)", "suggested": True})
    if any_ease:
        items.append({"id": "no-extra-tension", "text": "Please don't add extra tension, like a tight ponytail or bun on top.",
                      "why": "Your check-ins flagged tension", "suggested": False})
    names = zone_names()
    for zone, zs in escalation.latest_zone_states(db, user.id).items():
        if zs.state in ("watch", "get_checked"):
            items.append({"id": f"zone-{zone}", "text": f"Please be gentle around my {names[zone].lower()}: I'm keeping an eye on it.",
                          "why": f"Your Crown Map shows {STATE_WORDS[zs.state]} there", "suggested": True})
    return items
