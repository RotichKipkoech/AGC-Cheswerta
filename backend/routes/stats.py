"""
stats.py — Report data API + PDF generation.

Endpoints:
  GET  /api/stats/summary          → dashboard-style summary counts
  POST /api/stats/report/pdf       → download a PDF report
       body: { type: "givings"|"attendance"|"members"|"monthly", date_from?, date_to?, ... }
"""
from __future__ import annotations
import io
from datetime import date, datetime
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import func
from extensions import db
from models import Member, Giving, Attendance, SystemSetting
from security import require_auth

bp = Blueprint("stats", __name__, url_prefix="/api/stats")


# ── helpers ────────────────────────────────────────────────────────────────────

def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)).date()
    except ValueError:
        return None


def _q_givings(date_from=None, date_to=None, giving_type=None):
    q = Giving.query
    if date_from:
        q = q.filter(Giving.date >= date_from)
    if date_to:
        q = q.filter(Giving.date <= date_to)
    if giving_type and giving_type != "all":
        q = q.filter(Giving.type == giving_type)
    return q.order_by(Giving.date.desc()).all()


def _q_attendance(date_from=None, date_to=None):
    q = Attendance.query
    if date_from:
        q = q.filter(Attendance.date >= date_from)
    if date_to:
        q = q.filter(Attendance.date <= date_to)
    return q.order_by(Attendance.date.desc()).all()


def _q_members(gender=None, status=None):
    q = Member.query
    if gender and gender != "all":
        q = q.filter(Member.gender == gender)
    if status and status != "all":
        q = q.filter(Member.status == status)
    return q.order_by(Member.full_name.asc()).all()


def _fetch_branding_asset(field_name):
    """
    Fetch a branding image (e.g. "logo_url", "report_stamp_url") from Supabase
    Storage as raw bytes, for embedding directly in a generated PDF — ReportLab's
    Image flowable accepts a file-like object just as happily as a path, so no
    temp file is needed. Returns a BytesIO, or None if the field isn't set or
    the file can't be fetched (e.g. it's been removed since the setting was saved).
    """
    setting = SystemSetting.query.get("app_branding")
    if not setting or not setting.value:
        return None
    url = (setting.value.get(field_name) or "").strip()
    if not url:
        return None

    from supabase_client import supabase

    # Supabase public URLs look like:
    #   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path...>
    marker = "/object/public/"
    if marker in url:
        bucket, rel = url.split(marker, 1)[1].split("/", 1)
    else:
        # Not a recognisable Supabase public URL — branding assets always
        # live in the "branding" bucket (see uploads.py), so fall back to
        # treating whatever's left as the path within it.
        bucket, rel = "branding", url.lstrip("/")

    try:
        file_bytes = supabase.storage.from_(bucket).download(rel)
        return io.BytesIO(file_bytes)
    except Exception:
        return None


def _get_logo_image():
    return _fetch_branding_asset("logo_url")


def _get_stamp_image():
    return _fetch_branding_asset("report_stamp_url")


# ── summary endpoint ───────────────────────────────────────────────────────────

@bp.get("/summary")
@require_auth
def summary():
    total_members   = Member.query.count()
    active_members  = Member.query.filter_by(status="active").count()
    baptized        = Member.query.filter_by(baptism_status="Baptized").count()
    total_givings   = db.session.query(func.sum(Giving.amount)).scalar() or 0
    this_month      = date.today().replace(day=1)
    month_givings   = db.session.query(func.sum(Giving.amount)).filter(Giving.date >= this_month).scalar() or 0
    attendance_recs = Attendance.query.count()
    last_att        = Attendance.query.order_by(Attendance.date.desc()).first()
    return jsonify({
        "total_members": total_members,
        "active_members": active_members,
        "baptized_members": baptized,
        "total_givings": float(total_givings),
        "month_givings": float(month_givings),
        "attendance_records": attendance_recs,
        "last_attendance_total": last_att.total_present if last_att else 0,
    })


# ── PDF generation ─────────────────────────────────────────────────────────────

@bp.post("/report/pdf")
@require_auth
def generate_pdf():
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table as RLTable,
            TableStyle, HRFlowable, Image as RLImage, KeepTogether
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    except ImportError:
        return jsonify({"error": "reportlab is not installed. Run: pip install reportlab"}), 500

    data   = request.get_json(silent=True) or {}
    rtype  = data.get("type", "givings")
    df     = _parse_date(data.get("date_from"))
    dt     = _parse_date(data.get("date_to"))
    now    = datetime.now().strftime("%d %b %Y %H:%M")

    # Monthly District Report has far more columns than the other report
    # types — it needs the extra width landscape gives. The others stay
    # portrait since their existing column widths already fit comfortably.
    page_size = landscape(A4) if rtype == "monthly" else A4
    margin_h  = 1.8 * cm
    content_width = page_size[0] - 2 * margin_h

    margin_v = 0.8 * cm if rtype == "monthly" else 2 * cm
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=page_size,
        leftMargin=margin_h, rightMargin=margin_h,
        topMargin=margin_v, bottomMargin=margin_v,
    )

    styles = getSampleStyleSheet()
    H1  = ParagraphStyle("H1",  parent=styles["Heading1"], fontSize=16, alignment=TA_CENTER, spaceAfter=4)
    H2  = ParagraphStyle("H2",  parent=styles["Heading2"], fontSize=12, spaceAfter=4, spaceBefore=12)
    SUB = ParagraphStyle("SUB", parent=styles["Normal"],   fontSize=9,  textColor=colors.grey, alignment=TA_CENTER, spaceAfter=12)
    CELL = ParagraphStyle("CELL", parent=styles["Normal"], fontSize=8)

    PRIMARY   = colors.HexColor("#c0392b")   # AGC red
    HDR_BG    = colors.HexColor("#c0392b")
    ROW_ALT   = colors.HexColor("#fdf2f2")
    BORDER    = colors.HexColor("#e8d5d5")

    def _tbl(headers, rows, col_widths=None):
        """Build a styled ReportLab table."""
        all_rows = [[Paragraph(str(h), ParagraphStyle("TH", parent=styles["Normal"],
                     fontSize=8, textColor=colors.white, fontName="Helvetica-Bold"))
                     for h in headers]] + \
                   [[Paragraph(str(c), CELL) for c in row] for row in rows]
        tbl = RLTable(all_rows, colWidths=col_widths, repeatRows=1)
        ts = TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), HDR_BG),
            ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
            ("ALIGN",       (0,0), (-1,-1), "LEFT"),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, ROW_ALT]),
            ("GRID",        (0,0), (-1,-1), 0.4, BORDER),
            ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",  (0,0), (-1,-1), 4),
            ("BOTTOMPADDING",(0,0),(-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING",(0,0), (-1,-1), 6),
        ])
        tbl.setStyle(ts)
        return tbl

    def _header(title, subtitle=""):
        """
        Official AGC letterhead matching the paper form:
          [logo left]  AFRICA GOSPEL CHURCH, Kenya  (bold, centred)
                       TENWEK AREA                  (centred)
                       P.O. BOX 219 – 20400         (centred)
                       BOMET, KENYA.                (centred)
          ── red rule ──
          The whole church, taking the whole gospel to the whole world.  (red, italic, centred)
          ── red rule ──
          MONTHLY REPORT  (or report-specific title)  (bold caps, centred)
        """
        ADDR  = ParagraphStyle("ADDR",  parent=styles["Normal"], fontSize=9,  alignment=TA_CENTER, leading=13)
        TITLE_MAIN = ParagraphStyle("TITLEM", parent=styles["Normal"], fontSize=14, alignment=TA_CENTER,
                                    fontName="Helvetica-Bold", spaceAfter=1, leading=17)
        TAGLINE = ParagraphStyle("TAGL", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER,
                                 textColor=PRIMARY, fontName="Helvetica-Oblique", spaceAfter=2)
        RPT_TITLE = ParagraphStyle("RPTTTL", parent=styles["Normal"], fontSize=13, alignment=TA_CENTER,
                                   fontName="Helvetica-Bold", spaceBefore=4, spaceAfter=6)

        logo_image = _get_logo_image()
        logo_img = None
        if logo_image:
            try:
                logo_img = RLImage(logo_image, width=2.2*cm, height=2.2*cm, kind="proportional")
            except Exception:
                logo_img = None

        elements = []

        # Church name + address block (always centred on the full page width)
        name_block = [
            Paragraph("AFRICA GOSPEL CHURCH, Kenya", TITLE_MAIN),
            Paragraph("TENWEK AREA", ADDR),
            Paragraph("P.O. BOX 219 – 20400", ADDR),
            Paragraph("BOMET, KENYA.", ADDR),
        ]

        if logo_img:
            # Logo on the left, name block centred in the remaining width —
            # achieved with a 3-col row [logo | name_block | spacer] so the
            # text block's own centring still lands on the page centre
            # rather than the centre of the narrower remaining space.
            logo_w = 2.6*cm
            head_tbl = RLTable([[logo_img, name_block, ""]],
                                colWidths=[logo_w, content_width - 2*logo_w, logo_w])
            head_tbl.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("ALIGN",  (0,0), (0,0), "LEFT"),
                ("LEFTPADDING", (0,0), (-1,-1), 0),
                ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ("TOPPADDING", (0,0), (-1,-1), 0),
                ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ]))
            elements.append(head_tbl)
        else:
            elements += name_block

        elements += [
            Spacer(1, 0.15*cm),
            HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=4),
            Paragraph("The whole church, taking the whole gospel to the whole world.", TAGLINE),
            HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=6),
            Paragraph(subtitle.upper() if subtitle else title.upper(), RPT_TITLE),
            Spacer(1, 0.2*cm),
        ]
        return elements

    def _period_line(df, dt):
        parts = []
        if df: parts.append(f"From: {df}")
        if dt: parts.append(f"To: {dt}")
        parts.append(f"Generated: {now}")
        return Paragraph("  |  ".join(parts), ParagraphStyle("meta", parent=styles["Normal"], fontSize=8, textColor=colors.grey, spaceAfter=8))

    story = []

    # ── Givings Report ──────────────────────────────────────────────────────────
    if rtype == "givings":
        givings = _q_givings(df, dt, data.get("giving_type"))
        grand   = sum(float(g.amount) for g in givings)
        by_type: dict[str, float] = {}
        for g in givings:
            by_type[g.type] = by_type.get(g.type, 0) + float(g.amount)

        story += _header("Givings Report", f"Giving Report — {len(givings)} records")
        story.append(_period_line(df, dt))

        # Summary cards as a mini table
        summary_rows = [[t, f"KES {v:,.2f}"] for t, v in sorted(by_type.items())]
        summary_rows.append(["GRAND TOTAL", f"KES {grand:,.2f}"])
        story.append(Paragraph("Summary by Type", H2))
        story.append(_tbl(["Type", "Amount"], summary_rows, [8*cm, 6*cm]))
        story.append(Spacer(1, 0.5*cm))

        story.append(Paragraph("All Transactions", H2))
        rows = [[g.date, g.type, g.member_name or "—", f"KES {float(g.amount):,.2f}", g.notes or "—"]
                for g in givings]
        if rows:
            page_w = A4[0] - 3.6*cm
            story.append(_tbl(["Date", "Type", "Member", "Amount", "Notes"], rows,
                               [2.2*cm, 2.8*cm, 4*cm, 3*cm, page_w-12*cm]))
        else:
            story.append(Paragraph("No records in this period.", styles["Normal"]))

    # ── Attendance Report ───────────────────────────────────────────────────────
    elif rtype == "attendance":
        recs   = _q_attendance(df, dt)
        total  = sum(r.total_present for r in recs)
        avg    = round(total / len(recs)) if recs else 0

        story += _header("Attendance Report", f"Attendance Report — {len(recs)} services")
        story.append(_period_line(df, dt))

        # Stats strip
        stats_rows = [["Total Services", "Total Attendance", "Average per Service"],
                      [str(len(recs)), str(total), str(avg)]]
        st = RLTable(stats_rows, colWidths=[6*cm, 6*cm, 6*cm])
        st.setStyle(TableStyle([
            ("BACKGROUND",   (0,0), (-1,0), HDR_BG),
            ("TEXTCOLOR",    (0,0), (-1,0), colors.white),
            ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",     (0,0), (-1,-1), 9),
            ("ALIGN",        (0,0), (-1,-1), "CENTER"),
            ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
            ("TOPPADDING",   (0,0), (-1,-1), 6),
            ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ]))
        story.append(st)
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph("Service Records", H2))

        rows = [[r.date, r.event_name or "—",
                 r.men, r.women, r.youths, r.children, r.visitors, r.total_present]
                for r in recs]
        cw = [2.2*cm, 3.8*cm, 1.6*cm, 1.8*cm, 1.6*cm, 2*cm, 1.8*cm, 1.8*cm]
        story.append(_tbl(["Date", "Service", "Men", "Women", "Youth", "Children", "Visitors", "Total"],
                          rows, cw))

    # ── Members Report ──────────────────────────────────────────────────────────
    elif rtype == "members":
        members = _q_members(data.get("gender"), data.get("status"))
        baptized   = sum(1 for m in members if m.baptism_status == "Baptized")
        unbaptized = sum(1 for m in members if m.baptism_status == "Not Baptized")

        story += _header("Members Report", f"Members Register — {len(members)} members")
        story.append(_period_line(None, None))

        # Stats strip
        male   = sum(1 for m in members if m.gender == "Male")
        female = sum(1 for m in members if m.gender == "Female")
        stats_rows = [["Total", "Male", "Female", "Baptized", "Not Baptized"],
                      [str(len(members)), str(male), str(female), str(baptized), str(unbaptized)]]
        st = RLTable(stats_rows, colWidths=[3.2*cm]*5)
        st.setStyle(TableStyle([
            ("BACKGROUND",   (0,0), (-1,0), HDR_BG),
            ("TEXTCOLOR",    (0,0), (-1,0), colors.white),
            ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",     (0,0), (-1,-1), 9),
            ("ALIGN",        (0,0), (-1,-1), "CENTER"),
            ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
            ("TOPPADDING",   (0,0), (-1,-1), 6),
            ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ]))
        story.append(st)
        story.append(Spacer(1, 0.5*cm))

        rows = [[m.full_name, m.gender or "—", m.phone or "—",
                 m.department or "—", m.baptism_status or "—",
                 m.join_date.isoformat() if m.join_date else "—", m.status]
                for m in members]
        cw = [4*cm, 1.8*cm, 3*cm, 2.8*cm, 2.5*cm, 2.2*cm, 1.8*cm]
        story.append(Paragraph("Member List", H2))
        story.append(_tbl(["Name", "Gender", "Phone", "Ministry", "Baptism", "Joined", "Status"],
                          rows, cw))

    # ── Monthly District Report ─────────────────────────────────────────────────
    elif rtype == "monthly":
        meta = data.get("meta", {})
        district     = meta.get("district", "")
        local_church = meta.get("localChurch", "")
        code         = meta.get("code", "")
        month        = meta.get("month", date.today().strftime("%B"))
        year         = meta.get("year", str(date.today().year))
        pastor_name  = meta.get("pastorName", "")
        district_leader_name = meta.get("districtLeaderName", "")
        comments     = meta.get("comments", "")
        pastor_pension = float(meta.get("pastorPension", 0))
        ref_pension     = meta.get("refPension", "")
        ref_central     = meta.get("refCentral", "")
        ref_area        = meta.get("refArea", "")
        ref_regional    = meta.get("refRegional", "")
        ref_district    = meta.get("refDistrict", "")
        sunday_schools  = meta.get("sundaySchools", 0)
        building_type  = meta.get("buildingType", "")
        title_deed     = meta.get("titleDeedNo", "")

        sun_recs   = sorted([r for r in _q_attendance(df, dt) if (r.event_name or "").startswith("Sunday")], key=lambda r: r.date)
        thur_recs  = sorted([r for r in _q_attendance(df, dt) if "Thursday" in (r.event_name or "")], key=lambda r: r.date)
        all_givings = _q_givings(df, dt)

        def day_givings(d, gtype=None):
            gs = [g for g in all_givings if str(g.date) == str(d)]
            if gtype:
                gs = [g for g in gs if g.type == gtype]
            return sum(float(g.amount) for g in gs)

        story += _header("Monthly District Report",
                         f"AFRICA GOSPEL CHURCH — Monthly Report | {month} {year}")
        story.append(_period_line(df, dt))

        # Church info
        info_data = [
            ["District:", district, "Local Church:", local_church],
            ["Code:", code, "Month / Year:", f"{month} {year}"],
        ]
        info_tbl = RLTable(info_data, colWidths=[3*cm, 5*cm, 3.5*cm, 5*cm])
        info_tbl.setStyle(TableStyle([
            ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
            ("FONTNAME",    (0,0), (0,-1), "Helvetica-Bold"),
            ("FONTNAME",    (2,0), (2,-1), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 9),
            ("GRID",        (0,0), (-1,-1), 0.4, BORDER),
            ("TOPPADDING",  (0,0), (-1,-1), 5),
            ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
        ]))
        story += [info_tbl, Spacer(1, 0.15*cm)]

        # ── Combined attendance grid — matches the paper form's structure:
        # CHURCH SERVICE | SUNDAY SCHOOL | YOUTH SERVICE | WEEK DAY FELLOWSHIP
        # (Sunday School / Youth Service columns stay blank — not tracked
        # elsewhere in the system; left for manual completion.)
        COMPACT_H = ParagraphStyle("CSH", parent=styles["Normal"], fontSize=11,
                                    fontName="Helvetica-Bold", spaceBefore=2, spaceAfter=4)
        story.append(Paragraph("Church Service — No. of Attendance", COMPACT_H))

        tot = dict(men=0, women=0, youths=0, children=0, visitors=0,
                   total=0, offering=0.0, tithes=0.0, tithers=0)
        for r in sun_recs:
            offering = day_givings(r.date, "Offering")
            tithes   = day_givings(r.date, "Tithe")
            tithers  = len([g for g in all_givings if str(g.date) == str(r.date) and g.type == "Tithe"])
            tot["men"] += r.men; tot["women"] += r.women; tot["youths"] += r.youths
            tot["children"] += r.children; tot["visitors"] += r.visitors
            tot["total"] += r.total_present
            tot["offering"] += offering; tot["tithes"] += tithes; tot["tithers"] += tithers

        n = len(sun_recs)
        def savg(key): return round(tot[key] / n) if n else 0

        thu_no = 0; thu_off = 0.0
        for r in thur_recs:
            thu_no += r.total_present
            thu_off += day_givings(r.date, "Offering")

        GH = ParagraphStyle("GH", parent=styles["Normal"], fontSize=7, textColor=colors.white,
                             fontName="Helvetica-Bold", alignment=TA_CENTER)
        CH = ParagraphStyle("CH", parent=styles["Normal"], fontSize=6.5, textColor=colors.white,
                             fontName="Helvetica-Bold", alignment=TA_CENTER, leading=8)
        GD = ParagraphStyle("GD", parent=styles["Normal"], fontSize=7.5, alignment=TA_CENTER)
        GB = ParagraphStyle("GB", parent=styles["Normal"], fontSize=7.5, alignment=TA_CENTER, fontName="Helvetica-Bold")

        n_rows = max(len(sun_recs), len(thur_recs), 4)
        grid = [
            ["CHURCH SERVICE — NO. OF ATTENDANCE", "", "", "", "", "", "", "", "", "",
             "SUNDAY SCHOOL", "", "YOUTH SERVICE", "", "", "WEEK DAY FELLOWSHIP", "", ""],
            ["Date", "Men", "Women", "Youths", "Children", "Visitors", "New\nConvert", "Total",
             "Offering", "Tithes", "No.", "Offering", "No.", "Offerings", "Date", "Date", "No.", "Offering"],
        ]
        for i in range(n_rows):
            row = [""] * 18
            if i < len(sun_recs):
                r = sun_recs[i]
                offering = day_givings(r.date, "Offering")
                tithes   = day_givings(r.date, "Tithe")
                row[0:10] = [r.date.strftime("%d/%m/%Y"), r.men, r.women, r.youths, r.children, r.visitors,
                             "", r.total_present, f"{offering:,.0f}", f"{tithes:,.0f}"]
            if i < len(thur_recs):
                t = thur_recs[i]
                t_off = day_givings(t.date, "Offering")
                row[15], row[16], row[17] = t.date.strftime("%d/%m/%Y"), t.total_present, f"{t_off:,.0f}"
            grid.append(row)

        grid.append(["Total", tot["men"], tot["women"], tot["youths"], tot["children"], tot["visitors"],
                     "", tot["total"], f"{tot['offering']:,.0f}", f"{tot['tithes']:,.0f}",
                     "", "", "", "", "", "", thu_no, f"{thu_off:,.0f}"])
        grid.append(["Ave", savg("men"), savg("women"), savg("youths"), savg("children"), savg("visitors"),
                     "", savg("total"), f"{savg('offering'):,.0f}", f"{savg('tithes'):,.0f}"] + [""] * 8)

        styled = []
        last2 = len(grid) - 2
        for ridx, row in enumerate(grid):
            if ridx == 0:
                styled.append([Paragraph(c, GH) if c else "" for c in row])
            elif ridx == 1:
                styled.append([Paragraph(c, CH) for c in row])
            else:
                style = GB if ridx >= last2 else GD
                styled.append([Paragraph(str(c), style) if c != "" else "" for c in row])

        col_fracs = [0.072, 0.040, 0.048, 0.048, 0.052, 0.048, 0.052, 0.042, 0.052, 0.042,
                     0.042, 0.052,
                     0.042, 0.052, 0.042,
                     0.062, 0.042, 0.054]
        fsum = sum(col_fracs)
        grid_col_widths = [content_width * (f / fsum) for f in col_fracs]

        grid_tbl = RLTable(styled, colWidths=grid_col_widths, repeatRows=2,
                            rowHeights=[None, None] + [13] * (n_rows + 2))
        grid_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 1), HDR_BG),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("SPAN", (0, 0), (9, 0)),
            ("SPAN", (10, 0), (11, 0)),
            ("SPAN", (12, 0), (14, 0)),
            ("SPAN", (15, 0), (17, 0)),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("BACKGROUND", (0, last2), (-1, -1), ROW_ALT),
        ]))
        story.append(grid_tbl)
        story.append(Spacer(1, 0.15*cm))

        # Grand total & splits
        mission     = sum(float(g.amount) for g in all_givings if g.type == "Mission")
        baby_center = sum(float(g.amount) for g in all_givings if g.type == "Baby Center")
        grand       = tot["offering"] + tot["tithes"] + thu_off
        splits = {
            "10% To Central":  grand * 0.10,
            "5% To Regional":  grand * 0.05,
            "10% To Area":     grand * 0.10,
            "5% To District":  grand * 0.05,
            "Mission":         mission,
            "Baby Center":     baby_center,
            "Pastor's Pension":pastor_pension,
        }

        FB  = ParagraphStyle("FB",  parent=styles["Normal"], fontSize=7.5, leading=9)
        FBb = ParagraphStyle("FBb", parent=styles["Normal"], fontSize=7.5, leading=9, fontName="Helvetica-Bold")
        FBg = ParagraphStyle("FBg", parent=styles["Normal"], fontSize=6.5, leading=8,
                              textColor=colors.HexColor("#888888"))

        # Splits table: label | amount | ref-number  (3 columns)
        split_rows = [
            [Paragraph("10% To Central",  FB),  Paragraph(f"KES {splits['10% To Central']:,.2f}",  FBb), Paragraph(f"Ref: {ref_central}",  FBg)],
            [Paragraph("5% To Regional",  FB),  Paragraph(f"KES {splits['5% To Regional']:,.2f}",  FBb), Paragraph(f"Ref: {ref_regional}", FBg)],
            [Paragraph("10% To Area",     FB),  Paragraph(f"KES {splits['10% To Area']:,.2f}",     FBb), Paragraph(f"Ref: {ref_area}",     FBg)],
            [Paragraph("5% To District",  FB),  Paragraph(f"KES {splits['5% To District']:,.2f}",  FBb), Paragraph(f"Ref: {ref_district}", FBg)],
            [Paragraph("Mission",         FB),  Paragraph(f"KES {splits['Mission']:,.2f}",         FBb), Paragraph("",                      FBg)],
            [Paragraph("Baby Center",     FB),  Paragraph(f"KES {splits['Baby Center']:,.2f}",     FBb), Paragraph("",                      FBg)],
            [Paragraph("Pastor's Pension", FB), Paragraph(f"KES {splits["Pastor's Pension"]:,.2f}", FBb), Paragraph(f"Ref: {ref_pension}", FBg)],
        ]
        splits_tbl = RLTable(split_rows, colWidths=[3.2*cm, 2.4*cm, 2.8*cm])
        splits_tbl.setStyle(TableStyle([
            ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
            ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
            ("LEFTPADDING",  (0,0), (-1,-1), 4),
            ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, ROW_ALT]),
        ]))
        left_col = [Paragraph(f"Grand Total: KES {grand:,.2f}", H2), Spacer(1, 0.15*cm), splits_tbl]

        # Right column: extra info + comments + signature, stacked
        extra_rows = [
            ["Ref (Pension)", ref_pension, "No. Sunday Schools", str(sunday_schools)],
            ["Building Type", building_type, "Title Deed No.", title_deed],
        ]
        extra_tbl = RLTable(extra_rows, colWidths=[2.6*cm, 3.4*cm, 3*cm, 3.4*cm])
        extra_tbl.setStyle(TableStyle([
            ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
            ("FONTNAME",   (2,0), (2,-1), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 7.5),
            ("GRID",       (0,0), (-1,-1), 0.4, BORDER),
            ("TOPPADDING", (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0),(-1,-1),3),
            ("LEFTPADDING",(0,0), (-1,-1), 4),
        ]))

        sig_data = [["Pastor's Name", "Signature", "Date"],
                    [pastor_name, "", ""]]
        sig_tbl = RLTable(sig_data, colWidths=[4*cm, 4.2*cm, 3.2*cm])
        sig_style = TableStyle([
            ("BACKGROUND",   (0,0), (-1,0), HDR_BG),
            ("TEXTCOLOR",    (0,0), (-1,0), colors.white),
            ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",     (0,0), (-1,-1), 7.5),
            ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
            ("LEFTPADDING",  (0,0), (-1,-1), 5),
        ])
        sig_tbl.setStyle(sig_style)

        dl_data = [["District Leader's Name", "Signature", "Date"],
                   [district_leader_name, "", ""]]
        dl_tbl = RLTable(dl_data, colWidths=[4*cm, 4.2*cm, 3.2*cm])
        dl_tbl.setStyle(sig_style)

        # Official stamp — same mechanism as the header logo: set once in
        # Branding → Logos & images, and every report picks it up from here.
        # Placed to the LEFT of the signature tables (not stacked below them)
        # so it adds width, not height: measured with reportlab's own
        # Flowable.wrap(), this adds 0cm of extra height over the
        # signatures-only baseline (a stacked-below layout added ~3.2cm),
        # which is what was tipping the whole KeepTogether footer onto a
        # second page.
        STAMP_CAPTION = ParagraphStyle("STAMPCAP", parent=styles["Normal"], fontSize=6,
                                        textColor=colors.grey, alignment=TA_CENTER, spaceBefore=2, leading=7)
        stamp_image = _get_stamp_image()
        stamp_content = None
        if stamp_image:
            try:
                stamp_content = RLImage(stamp_image, width=1.8*cm, height=1.8*cm, kind="proportional")
            except Exception:
                stamp_content = None
        stamp_box = RLTable([[stamp_content or Paragraph("Official Stamp", STAMP_CAPTION)]],
                             colWidths=[2.4*cm])
        stamp_box.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.6, BORDER),
            ("ALIGN", (0,0), (-1,-1), "CENTER"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]))

        sig_stack = [sig_tbl, Spacer(1, 0.12*cm), dl_tbl]
        sig_row = RLTable([[stamp_box, sig_stack]], colWidths=[2.4*cm, 4*cm+4.2*cm+3.2*cm])
        sig_row.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING", (0,0), (0,0), 0),
            ("RIGHTPADDING", (0,0), (0,0), 6),
            ("LEFTPADDING", (1,0), (1,0), 0),
            ("RIGHTPADDING", (1,0), (1,0), 0),
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ]))

        # Comments/Remarks is always shown — matches the paper form's
        # always-present blank line, filled in if a comment was typed.
        right_col = [
            extra_tbl, Spacer(1, 0.15*cm),
            Paragraph(f"<b>Comments/Remarks:</b> {comments}", FB), Spacer(1, 0.15*cm),
            sig_row,
        ]

        footer_outer = RLTable([[left_col, right_col]], colWidths=[content_width*0.45, content_width*0.55])
        footer_outer.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (0,0), 22),
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ]))

        # Keep the whole footer together rather than letting it split
        # awkwardly mid-table across a page boundary.
        story.append(KeepTogether([footer_outer]))

    else:
        return jsonify({"error": f"Unknown report type: {rtype}"}), 400

    doc.build(story)
    buf.seek(0)
    # Use selected month name for monthly reports, ISO date for others
    if rtype == "monthly":
        _meta   = data.get("meta", {})
        _month  = (_meta.get("month") or date.today().strftime("%B")).replace(" ", "_")
        _year   = _meta.get("year") or str(date.today().year)
        filename = f"AGC_Monthly_Report_{_month}_{_year}.pdf"
    else:
        filename = f"AGC_{rtype}_report_{date.today().isoformat()}.pdf"
    return send_file(buf, mimetype="application/pdf",
                     as_attachment=True, download_name=filename)