"""Builds a laboratory result PDF in memory from structured values entered by lab staff."""
import io
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

MAX_ROWS = 40
NAVY = colors.HexColor("#0F2A4A")
TEAL = colors.HexColor("#0E8A7D")
LIGHT = colors.HexColor("#EAF4F3")


def _number(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def result_flag(value, low, high) -> str:
    """LOW / HIGH / NORMAL when the result and a reference bound are numeric, otherwise an empty string."""
    number, low_n, high_n = _number(value), _number(low), _number(high)
    if number is None or (low_n is None and high_n is None):
        return ""
    if low_n is not None and number < low_n:
        return "LOW"
    if high_n is not None and number > high_n:
        return "HIGH"
    return "NORMAL"


def clean_rows(rows):
    """Validate and normalise result rows; raises ValueError with a user-facing message."""
    if not isinstance(rows, list) or not rows:
        raise ValueError("Add at least one test result.")
    if len(rows) > MAX_ROWS:
        raise ValueError(f"A report can contain at most {MAX_ROWS} results.")
    cleaned = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid result row.")
        item = {key: str(row.get(key, "")).strip() for key in ("name", "value", "unit", "low", "high")}
        if not item["name"] and not item["value"]:
            continue  # ignore completely empty rows
        if not item["name"] or not item["value"]:
            raise ValueError("Every result needs both a parameter name and a value.")
        limits = {"name": 80, "value": 40, "unit": 20, "low": 20, "high": 20}
        if any(len(item[key]) > limit for key, limit in limits.items()):
            raise ValueError("A result field is too long.")
        for bound in ("low", "high"):
            if item[bound] and _number(item[bound]) is None:
                raise ValueError("Reference range limits must be numbers.")
        item["flag"] = result_flag(item["value"], item["low"], item["high"])
        cleaned.append(item)
    if not cleaned:
        raise ValueError("Add at least one test result.")
    return cleaned


def build_report_pdf(*, patient, staff, report_name, test_type, rows, notes="", collected_on="") -> bytes:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=base, fontSize=8, leading=11, textColor=colors.HexColor("#666666"))
    title = ParagraphStyle("title", parent=base, fontName="Helvetica-Bold", fontSize=17, leading=22, textColor=NAVY)
    head = ParagraphStyle("head", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=TEAL, spaceBefore=10, spaceAfter=4)
    cell = ParagraphStyle("cell", parent=base, fontSize=9, leading=12)
    now = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    e = lambda text: escape(str(text or ""))

    story = [
        Paragraph("SecureLab Diagnostics", ParagraphStyle("brand", parent=base, fontName="Helvetica-Bold", fontSize=10, textColor=TEAL)),
        Paragraph(e(report_name), title),
        Paragraph(e(test_type), ParagraphStyle("sub", parent=base, fontSize=11, textColor=colors.HexColor("#555555"))),
        Spacer(1, 6),
    ]
    info = [
        [Paragraph("<b>Patient</b>", cell), Paragraph(e(patient.name), cell), Paragraph("<b>Patient ID</b>", cell), Paragraph(e(patient.patient_code or "—"), cell)],
        [Paragraph("<b>Report date</b>", cell), Paragraph(now, cell), Paragraph("<b>Collected on</b>", cell), Paragraph(e(collected_on) or "—", cell)],
        [Paragraph("<b>Prepared by</b>", cell), Paragraph(e(staff.name), cell), Paragraph("<b>Email</b>", cell), Paragraph(e(patient.email), cell)],
    ]
    info_table = Table(info, colWidths=[28 * mm, 55 * mm, 28 * mm, 55 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [info_table, Paragraph("Results", head)]

    header_style = ParagraphStyle("th", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
    data = [[Paragraph(h, header_style) for h in ("Parameter", "Result", "Unit", "Reference range", "Flag")]]
    flag_rows = []
    for index, row in enumerate(rows, start=1):
        low, high = row["low"], row["high"]
        reference = f"{low} – {high}" if low and high else (f"≥ {low}" if low else (f"≤ {high}" if high else "—"))
        flag = row["flag"]
        color = {"HIGH": "#B23B45", "LOW": "#B26A00", "NORMAL": "#1D8A62"}.get(flag, "#666666")
        data.append([
            Paragraph(e(row["name"]), cell), Paragraph(f"<b>{e(row['value'])}</b>", cell), Paragraph(e(row["unit"]), cell),
            Paragraph(e(reference), cell), Paragraph(f'<font color="{color}"><b>{flag or "—"}</b></font>', cell),
        ])
        if flag in ("HIGH", "LOW"):
            flag_rows.append(index)
    table = Table(data, colWidths=[55 * mm, 28 * mm, 22 * mm, 38 * mm, 23 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6FAFA")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D5E0E3")),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    style += [("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FFF3F3")) for i in flag_rows]
    table.setStyle(TableStyle(style))
    story.append(table)

    if notes.strip():
        story += [Paragraph("Clinical notes", head), Paragraph(e(notes.strip()).replace("\n", "<br/>"), base)]
    story += [
        Spacer(1, 14),
        Paragraph("Values marked HIGH or LOW fall outside the reference range shown. Please discuss results with your clinician. "
                  "This report was generated in SecureLab, encrypted for the patient and digitally signed by the hospital. "
                  "Academic demonstration – use synthetic data only.", small),
    ]

    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title=report_name, author="SecureLab").build(story)
    return buffer.getvalue()
