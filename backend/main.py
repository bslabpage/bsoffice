from io import BytesIO
from pathlib import Path
import re
from urllib.parse import quote

import pymupdf as fitz
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pptx import Presentation
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.xmlchemy import OxmlElement
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

PPTX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)
RENDER_DPI = 200
EMU_PER_INCH = 914400
# Vector paths whose bounding box is smaller than this (in both directions) are noise.
MIN_DRAWING_SIZE_PT = 2.0
# Safety cap so extremely complex vector pages cannot make the slide unusably heavy.
MAX_DRAWINGS_PER_PAGE = 5000
BEZIER_STEPS = 8
VALID_MODES = {"editable", "overlay", "image"}
VALID_ASPECT_RATIOS = {"16:9", "4:3", "A4"}
XML_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

app = FastAPI(title="BOS'S Office PDF to PPTX API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://bslabpage.github.io",
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
    ],
    allow_origin_regex=(
        r"^https://[a-zA-Z0-9-]+\.github\.io$|"
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


def sanitize_xml_text(text: str) -> str:
    """Remove characters that are invalid in XML 1.0."""
    return XML_CONTROL_CHAR_RE.sub("", text)


def int_to_rgb(color_int: int) -> RGBColor:
    """Convert a PyMuPDF 24-bit RGB integer to python-pptx RGBColor."""
    r = (color_int >> 16) & 0xFF
    g = (color_int >> 8) & 0xFF
    b = color_int & 0xFF
    return RGBColor(r, g, b)


def set_run_font(
    run,
    font_name: str,
    font_size_pt: float,
    is_bold: bool,
    is_italic: bool,
    color: RGBColor,
) -> None:
    """Configure Latin, East Asian, and Complex Script font properties on a run."""
    run.font.name = font_name
    run.font.size = Pt(font_size_pt)
    run.font.bold = is_bold
    run.font.italic = is_italic
    run.font.color.rgb = color

    r_pr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = r_pr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            r_pr.append(el)
        el.set("typeface", font_name)


def get_slide_dimensions(
    aspect_ratio: str, first_page_rect: fitz.Rect
) -> tuple[float, float]:
    """Return (width_inches, height_inches) for the requested slide aspect ratio."""
    if aspect_ratio == "16:9":
        return 13.333, 7.5
    if aspect_ratio == "4:3":
        return 10.0, 7.5
    if first_page_rect.height > first_page_rect.width:
        return 8.268, 11.693
    return 11.693, 8.268


def compute_fit_transform(
    pdf_w: float, pdf_h: float, slide_w_in: float, slide_h_in: float
) -> tuple[float, float, float, float, float]:
    """Compute uniform scale and centered offsets to fit PDF page on slide."""
    safe_w = max(pdf_w, 1.0)
    safe_h = max(pdf_h, 1.0)
    scale = min(slide_w_in / safe_w, slide_h_in / safe_h)
    rendered_w_in = safe_w * scale
    rendered_h_in = safe_h * scale
    offset_x_in = (slide_w_in - rendered_w_in) / 2.0
    offset_y_in = (slide_h_in - rendered_h_in) / 2.0
    return scale, offset_x_in, offset_y_in, rendered_w_in, rendered_h_in


def _is_span_bold(span: dict) -> bool:
    flags = span.get("flags", 0)
    font_lower = (span.get("font") or "").lower()
    return bool(flags & 16) or any(
        token in font_lower for token in ("bold", "black", "heavy")
    )


def _is_span_italic(span: dict) -> bool:
    flags = span.get("flags", 0)
    font_lower = (span.get("font") or "").lower()
    return bool(flags & 2) or any(
        token in font_lower for token in ("italic", "oblique")
    )


def _merge_bboxes(
    bbox_a: tuple[float, float, float, float],
    bbox_b: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    return (
        min(bbox_a[0], bbox_b[0]),
        min(bbox_a[1], bbox_b[1]),
        max(bbox_a[2], bbox_b[2]),
        max(bbox_a[3], bbox_b[3]),
    )


def extract_text_groups(page_dict: dict, merge_paragraphs: bool) -> list[dict]:
    """Extract structured line/paragraph groups from PyMuPDF page text dict."""
    raw_groups: list[dict] = []

    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue

        block_lines: list[dict] = []
        for line in block.get("lines", []):
            spans_out: list[dict] = []
            for span in line.get("spans", []):
                text = sanitize_xml_text(span.get("text", ""))
                if not text or not text.strip():
                    continue
                spans_out.append(
                    {
                        "text": text,
                        "size": float(span.get("size") or 12.0),
                        "bold": _is_span_bold(span),
                        "italic": _is_span_italic(span),
                        "color": int(span.get("color", 0)),
                        "bbox": tuple(span.get("bbox", (0.0, 0.0, 0.0, 0.0))),
                    }
                )

            if not spans_out:
                continue

            line_bbox = line.get("bbox")
            if line_bbox:
                bbox_tuple = tuple(float(v) for v in line_bbox)
            else:
                bbox_tuple = spans_out[0]["bbox"]
                for sp in spans_out[1:]:
                    bbox_tuple = _merge_bboxes(bbox_tuple, sp["bbox"])

            max_size = max(sp["size"] for sp in spans_out)
            block_lines.append(
                {
                    "bbox": bbox_tuple,
                    "max_font_size": max_size,
                    "lines": [spans_out],
                }
            )

        if not block_lines:
            continue

        if not merge_paragraphs:
            raw_groups.extend(block_lines)
        else:
            group_bbox = block_lines[0]["bbox"]
            for ln in block_lines[1:]:
                group_bbox = _merge_bboxes(group_bbox, ln["bbox"])
            raw_groups.append(
                {
                    "bbox": group_bbox,
                    "max_font_size": max(ln["max_font_size"] for ln in block_lines),
                    "lines": [ln["lines"][0] for ln in block_lines],
                }
            )

    if not merge_paragraphs or len(raw_groups) <= 1:
        return raw_groups

    raw_groups.sort(key=lambda g: (g["bbox"][1], g["bbox"][0]))

    merged_groups: list[dict] = []
    for group in raw_groups:
        if not merged_groups:
            merged_groups.append(group)
            continue

        prev = merged_groups[-1]
        prev_x0, _, _, prev_y1 = prev["bbox"]
        curr_x0, curr_y0, _, _ = group["bbox"]

        vertical_gap = curr_y0 - prev_y1
        font_diff = abs(prev["max_font_size"] - group["max_font_size"])
        left_tolerance = max(group["max_font_size"] * 2.0, 24.0)
        max_fs = max(prev["max_font_size"], group["max_font_size"])
        is_heading = prev["max_font_size"] >= 20.0 or group["max_font_size"] >= 20.0

        if (
            not is_heading
            and font_diff <= 2.5
            and abs(prev_x0 - curr_x0) <= left_tolerance
            and -4.0 <= vertical_gap <= max_fs * 1.6
        ):
            prev["lines"].extend(group["lines"])
            prev["bbox"] = _merge_bboxes(prev["bbox"], group["bbox"])
            prev["max_font_size"] = max_fs
        else:
            merged_groups.append(group)

    return merged_groups


def add_text_groups_to_slide(
    slide,
    text_groups: list[dict],
    font_name: str,
    scale: float,
    offset_x_in: float,
    offset_y_in: float,
    slide_w_in: float,
    slide_h_in: float,
) -> None:
    """Create editable PowerPoint text boxes for extracted text groups."""
    font_scale = scale * 72.0

    for group in text_groups:
        x0, y0, x1, y1 = group["bbox"]
        left_in = max(0.0, offset_x_in + (x0 * scale))
        top_in = max(0.0, offset_y_in + (y0 * scale))
        raw_w_in = max(0.15, (x1 - x0) * scale * 1.10)
        width_in = max(0.15, min(raw_w_in, slide_w_in - left_in))
        height_in = max(0.15, min(max(0.15, (y1 - y0) * scale), slide_h_in - top_in))

        textbox = slide.shapes.add_textbox(
            Inches(left_in),
            Inches(top_in),
            Inches(width_in),
            Inches(height_in),
        )
        textbox.fill.background()
        textbox.line.fill.background()

        tf = textbox.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.TOP
        tf.margin_left = Inches(0.01)
        tf.margin_right = Inches(0.01)
        tf.margin_top = Inches(0.01)
        tf.margin_bottom = Inches(0.01)

        for idx, line_spans in enumerate(group["lines"]):
            paragraph = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
            for span in line_spans:
                run = paragraph.add_run()
                run.text = span["text"]
                scaled_pt = max(6.0, min(96.0, round(span["size"] * font_scale, 1)))
                set_run_font(
                    run=run,
                    font_name=font_name,
                    font_size_pt=scaled_pt,
                    is_bold=span["bold"],
                    is_italic=span["italic"],
                    color=int_to_rgb(span["color"]),
                )


def render_page_to_png_stream(page: fitz.Page, dpi: int = RENDER_DPI) -> BytesIO:
    """Render a PyMuPDF page to an in-memory PNG BytesIO stream."""
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    stream = BytesIO(pix.tobytes("png"))
    stream.seek(0)
    return stream


class SlideMapper:
    """Maps PDF page coordinates (pt) to slide coordinates (EMU)."""

    def __init__(self, scale: float, offset_x_in: float, offset_y_in: float):
        self.scale = scale
        self.offset_x_in = offset_x_in
        self.offset_y_in = offset_y_in

    def x(self, value: float) -> int:
        return int(round((self.offset_x_in + value * self.scale) * EMU_PER_INCH))

    def y(self, value: float) -> int:
        return int(round((self.offset_y_in + value * self.scale) * EMU_PER_INCH))

    def length(self, value: float) -> int:
        return max(1, int(round(abs(value) * self.scale * EMU_PER_INCH)))


def pdf_color_to_rgb(color) -> RGBColor | None:
    """Convert a PyMuPDF float color tuple (gray/RGB/CMYK, 0..1) to RGBColor."""
    if not color:
        return None
    try:
        vals = [max(0.0, min(1.0, float(c))) for c in color]
    except (TypeError, ValueError):
        return None
    if len(vals) == 1:
        vals = vals * 3
    elif len(vals) == 4:
        c, m, y, k = vals
        vals = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
    elif len(vals) != 3:
        return None
    return RGBColor(*(int(round(v * 255)) for v in vals))


def _strip_shape_style(shape) -> None:
    """Remove theme style reference so no theme fill/outline/shadow leaks in."""
    style = shape._element.find(qn("p:style"))
    if style is not None:
        shape._element.remove(style)


def _apply_alpha(parent_el, opacity) -> None:
    """Add <a:alpha> to the solid color under parent_el (spPr or a:ln)."""
    if parent_el is None or opacity is None:
        return
    try:
        opacity = float(opacity)
    except (TypeError, ValueError):
        return
    if opacity >= 0.999:
        return
    solid = parent_el.find(qn("a:solidFill"))
    if solid is None:
        return
    clr = solid.find(qn("a:srgbClr"))
    if clr is None:
        return
    for old in clr.findall(qn("a:alpha")):
        clr.remove(old)
    alpha = OxmlElement("a:alpha")
    alpha.set("val", str(int(round(max(0.0, opacity) * 100000))))
    clr.append(alpha)


def _apply_drawing_line(shape, drawing: dict, mapper: SlideMapper) -> None:
    dtype = drawing.get("type") or ""
    stroke_rgb = pdf_color_to_rgb(drawing.get("color"))
    line = shape.line
    if stroke_rgb is None or "s" not in dtype:
        line.fill.background()
        return
    line.color.rgb = stroke_rgb
    width_pt = float(drawing.get("width") or 1.0) * mapper.scale * 72.0
    line.width = Pt(max(0.25, width_pt))
    dashes = (drawing.get("dashes") or "").replace(" ", "")
    if dashes and not dashes.startswith("[]"):
        line.dash_style = MSO_LINE_DASH_STYLE.DASH
    _apply_alpha(shape._element.spPr.find(qn("a:ln")), drawing.get("stroke_opacity"))


def _apply_drawing_style(shape, drawing: dict, mapper: SlideMapper) -> None:
    dtype = drawing.get("type") or ""
    fill_rgb = pdf_color_to_rgb(drawing.get("fill"))
    if fill_rgb is not None and "f" in dtype:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_rgb
        _apply_alpha(shape._element.spPr, drawing.get("fill_opacity"))
    else:
        shape.fill.background()
    _apply_drawing_line(shape, drawing, mapper)


def _sample_bezier(p0, c1, c2, p3, steps: int = BEZIER_STEPS) -> list[tuple[float, float]]:
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1.0 - t
        a, b, c, d = mt**3, 3 * mt * mt * t, 3 * mt * t * t, t**3
        points.append(
            (
                a * p0.x + b * c1.x + c * c2.x + d * p3.x,
                a * p0.y + b * c1.y + c * c2.y + d * p3.y,
            )
        )
    return points


def _drawing_to_contours(items: list) -> list[list[tuple[float, float]]]:
    """Flatten PyMuPDF path items (l/c/re/qu) into polygon contours."""
    contours: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []

    for item in items:
        op = item[0]
        if op in ("l", "c"):
            start = item[1]
            if (
                not current
                or abs(current[-1][0] - start.x) > 0.01
                or abs(current[-1][1] - start.y) > 0.01
            ):
                if len(current) >= 2:
                    contours.append(current)
                current = [(start.x, start.y)]
            if op == "l":
                current.append((item[2].x, item[2].y))
            else:
                current.extend(_sample_bezier(item[1], item[2], item[3], item[4]))
        elif op == "re":
            if len(current) >= 2:
                contours.append(current)
            r = fitz.Rect(item[1])
            r.normalize()
            contours.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            current = []
        elif op == "qu":
            if len(current) >= 2:
                contours.append(current)
            q = item[1]
            contours.append([(p.x, p.y) for p in (q.ul, q.ur, q.lr, q.ll)])
            current = []

    if len(current) >= 2:
        contours.append(current)
    return contours


def _is_axis_aligned_quad(quad) -> bool:
    return (
        abs(quad.ul.y - quad.ur.y) < 0.01
        and abs(quad.ll.y - quad.lr.y) < 0.01
        and abs(quad.ul.x - quad.ll.x) < 0.01
        and abs(quad.ur.x - quad.lr.x) < 0.01
    )


def add_drawing_to_slide(slide, drawing: dict, mapper: SlideMapper, page_rect: fitz.Rect) -> int:
    """Convert one PyMuPDF vector path into native PowerPoint shapes. Returns shape count."""
    rect = drawing.get("rect")
    items = drawing.get("items") or []
    if rect is None or not items:
        return 0
    rect = fitz.Rect(rect)
    rect.normalize()
    # Skip tiny decorative dots / curve noise; thin separators (long in one axis) are kept.
    if max(rect.width, rect.height) < MIN_DRAWING_SIZE_PT:
        return 0
    if not rect.intersects(page_rect) and not rect.is_empty:
        return 0

    dtype = drawing.get("type") or ""
    has_fill = "f" in dtype and drawing.get("fill") is not None
    has_stroke = "s" in dtype and drawing.get("color") is not None
    if not has_fill and not has_stroke:
        return 0

    ops = {item[0] for item in items}
    count = 0

    # 1) Pure rectangles (backgrounds, cards, filled bars) -> native rectangles
    if ops <= {"re", "qu"} and all(
        item[0] == "re" or _is_axis_aligned_quad(item[1]) for item in items
    ):
        for item in items:
            r = fitz.Rect(item[1]) if item[0] == "re" else fitz.Rect(item[1].rect)
            r.normalize()
            if max(r.width, r.height) < MIN_DRAWING_SIZE_PT:
                continue
            shape = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE,
                mapper.x(r.x0),
                mapper.y(r.y0),
                mapper.length(r.width),
                mapper.length(r.height),
            )
            _strip_shape_style(shape)
            _apply_drawing_style(shape, drawing, mapper)
            count += 1
        return count

    # 2) Stroke-only straight segments (dividers, rules, grid lines) -> connectors
    if ops <= {"l"} and not has_fill:
        for item in items:
            p1, p2 = item[1], item[2]
            if max(abs(p2.x - p1.x), abs(p2.y - p1.y)) < MIN_DRAWING_SIZE_PT:
                continue
            connector = slide.shapes.add_connector(
                MSO_CONNECTOR.STRAIGHT,
                mapper.x(p1.x),
                mapper.y(p1.y),
                mapper.x(p2.x),
                mapper.y(p2.y),
            )
            _strip_shape_style(connector)
            _apply_drawing_line(connector, drawing, mapper)
            count += 1
        return count

    # 3) Everything else (rounded cards, circles, icons, polygons) -> freeform
    contours = _drawing_to_contours(items)
    contours = [c for c in contours if len(c) >= 2]
    if not contours:
        return 0
    close = bool(has_fill or drawing.get("closePath"))
    emu_contours = [[(mapper.x(x), mapper.y(y)) for x, y in c] for c in contours]
    first = emu_contours[0]
    builder = slide.shapes.build_freeform(first[0][0], first[0][1], scale=1.0)
    builder.add_line_segments(first[1:], close=close)
    for contour in emu_contours[1:]:
        builder.move_to(*contour[0])
        builder.add_line_segments(contour[1:], close=close)
    shape = builder.convert_to_shape()
    _strip_shape_style(shape)
    _apply_drawing_style(shape, drawing, mapper)
    return 1


def add_vector_drawings_to_slide(slide, page: fitz.Page, mapper: SlideMapper) -> int:
    """Rebuild page backgrounds, boxes, lines and vector art as editable shapes."""
    try:
        drawings = page.get_drawings()
    except Exception:
        return 0
    page_rect = page.rect
    total = 0
    for drawing in drawings[:MAX_DRAWINGS_PER_PAGE]:
        try:
            total += add_drawing_to_slide(slide, drawing, mapper, page_rect)
        except Exception:
            # One malformed path must never abort the whole conversion.
            continue
    return total


def extract_image_png(doc: fitz.Document, xref: int, smask: int, cache: dict) -> bytes | None:
    """Extract an image xref as PNG, merging its soft mask (alpha channel) if present."""
    key = (xref, smask)
    if key in cache:
        return cache[key]

    png_bytes = None
    try:
        pix = fitz.Pixmap(doc, xref)
        if smask:
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)  # drop any existing alpha before re-masking
            if pix.colorspace is not None and pix.colorspace.n not in (1, 3):
                pix = fitz.Pixmap(fitz.csRGB, pix)
            mask = fitz.Pixmap(doc, smask)
            if mask.alpha:
                mask = fitz.Pixmap(mask, 0)
            if mask.colorspace is not None and mask.colorspace.n != 1:
                mask = fitz.Pixmap(fitz.csGRAY, mask)
            if (mask.width, mask.height) != (pix.width, pix.height):
                mask = fitz.Pixmap(mask, pix.width, pix.height, None)
            pix = fitz.Pixmap(pix, mask)
        elif pix.colorspace is not None and pix.colorspace.n not in (1, 3):
            pix = fitz.Pixmap(fitz.csRGB, pix)
        png_bytes = pix.tobytes("png")
    except Exception:
        try:
            png_bytes = doc.extract_image(xref).get("image")
        except Exception:
            png_bytes = None

    cache[key] = png_bytes
    return png_bytes


def add_picture_in_bbox(
    slide, image_bytes: bytes, bbox, page_rect: fitz.Rect, mapper: SlideMapper
) -> bool:
    """Place an image exactly at its PDF bbox; crop parts that fall outside the page."""
    rect = fitz.Rect(bbox)
    rect.normalize()
    if rect.is_empty or rect.width < 0.5 or rect.height < 0.5:
        return False
    visible = rect & page_rect
    if visible.is_empty:
        return False

    picture = slide.shapes.add_picture(
        BytesIO(image_bytes),
        mapper.x(visible.x0),
        mapper.y(visible.y0),
        mapper.length(visible.width),
        mapper.length(visible.height),
    )
    if visible != rect:
        picture.crop_left = (visible.x0 - rect.x0) / rect.width
        picture.crop_right = (rect.x1 - visible.x1) / rect.width
        picture.crop_top = (visible.y0 - rect.y0) / rect.height
        picture.crop_bottom = (rect.y1 - visible.y1) / rect.height
    return True


def add_page_images_to_slide(
    slide,
    doc: fitz.Document,
    page: fitz.Page,
    page_dict: dict,
    mapper: SlideMapper,
    image_cache: dict,
) -> int:
    """Insert every page image (with alpha soft masks) at its real placement bbox."""
    page_rect = page.rect
    smask_by_xref: dict[int, int] = {}
    try:
        for img in page.get_images(full=True):
            smask_by_xref[img[0]] = img[1]
    except Exception:
        pass

    inline_blocks = [
        b
        for b in page_dict.get("blocks", [])
        if b.get("type") == 1 and b.get("image") and b.get("bbox")
    ]

    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []

    placed = 0
    for info in infos:
        bbox = info.get("bbox")
        if not bbox:
            continue
        xref = int(info.get("xref") or 0)
        image_bytes = None
        if xref > 0:
            smask = int(info.get("smask") or smask_by_xref.get(xref, 0) or 0)
            image_bytes = extract_image_png(doc, xref, smask, image_cache)
        else:
            # Inline image (no xref): reuse the bytes from the matching text-dict block.
            target = fitz.Rect(bbox)
            for block in inline_blocks:
                b = fitz.Rect(block["bbox"])
                if (
                    abs(b.x0 - target.x0) < 1.5
                    and abs(b.y0 - target.y0) < 1.5
                    and abs(b.x1 - target.x1) < 1.5
                    and abs(b.y1 - target.y1) < 1.5
                ):
                    image_bytes = block["image"]
                    break
        if not image_bytes:
            continue
        try:
            if add_picture_in_bbox(slide, image_bytes, bbox, page_rect, mapper):
                placed += 1
        except Exception:
            # Skip unsupported image encodings without aborting conversion.
            continue
    return placed


def build_content_disposition(original_filename: str) -> str:
    """Build an ASCII-safe + RFC 5987 UTF-8 Content-Disposition header."""
    stem = Path(original_filename or "converted").stem or "converted"
    pptx_name = f"{stem}.pptx"
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("_") or "converted"
    ascii_name = f"{ascii_stem}.pptx"
    encoded_name = quote(pptx_name, safe="")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}"


@app.get("/")
@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "pdf-to-pptx"}


@app.post("/api/convert-pptx")
async def convert_pdf_to_pptx(
    file: UploadFile = File(...),
    mode: str = Form("editable"),
    font_name: str = Form("Malgun Gothic"),
    aspect_ratio: str = Form("16:9"),
    merge_paragraphs: bool = Form(True),
    add_notes: bool = Form(True),
) -> StreamingResponse:
    """Convert an uploaded PDF in memory into a downloadable PPTX presentation."""
    normalized_mode = mode.strip().lower()
    if normalized_mode not in VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode '{mode}'. Allowed values: editable, overlay, image.",
        )

    normalized_ratio = aspect_ratio.strip().upper()
    if normalized_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid aspect_ratio '{aspect_ratio}'. Allowed values: 16:9, 4:3, A4.",
        )

    target_font = font_name.strip() or "Malgun Gothic"
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to open PDF document: {exc}"
        ) from exc

    try:
        if doc.needs_pass:
            raise HTTPException(
                status_code=400, detail="Password-protected PDFs are not supported."
            )
        if doc.page_count == 0:
            raise HTTPException(status_code=400, detail="PDF document has no pages.")

        slide_w_in, slide_h_in = get_slide_dimensions(normalized_ratio, doc[0].rect)
        prs = Presentation()
        prs.slide_width = Inches(slide_w_in)
        prs.slide_height = Inches(slide_h_in)
        blank_layout = prs.slide_layouts[6]
        image_cache: dict = {}

        for page in doc:
            slide = prs.slides.add_slide(blank_layout)
            page_rect = page.rect
            scale, offset_x_in, offset_y_in, rendered_w_in, rendered_h_in = (
                compute_fit_transform(
                    page_rect.width, page_rect.height, slide_w_in, slide_h_in
                )
            )

            raw_notes_text = (
                sanitize_xml_text(page.get_text("text")).strip() if add_notes else ""
            )

            if normalized_mode == "image":
                img_stream = render_page_to_png_stream(page)
                slide.shapes.add_picture(
                    img_stream,
                    Inches(offset_x_in),
                    Inches(offset_y_in),
                    Inches(rendered_w_in),
                    Inches(rendered_h_in),
                )
            else:
                # Extract text structure before any redactions modify the page.
                page_dict = page.get_text("dict")
                text_groups = extract_text_groups(page_dict, merge_paragraphs)

                if normalized_mode == "overlay":
                    for block in page_dict.get("blocks", []):
                        if block.get("type") != 0:
                            continue
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                if (span.get("text") or "").strip():
                                    page.add_redact_annot(
                                        fitz.Rect(span["bbox"]), fill=False
                                    )

                    page.apply_redactions(
                        images=fitz.PDF_REDACT_IMAGE_NONE,
                        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                    )

                    bg_stream = render_page_to_png_stream(page)
                    slide.shapes.add_picture(
                        bg_stream,
                        Inches(offset_x_in),
                        Inches(offset_y_in),
                        Inches(rendered_w_in),
                        Inches(rendered_h_in),
                    )
                    add_text_groups_to_slide(
                        slide=slide,
                        text_groups=text_groups,
                        font_name=target_font,
                        scale=scale,
                        offset_x_in=offset_x_in,
                        offset_y_in=offset_y_in,
                        slide_w_in=slide_w_in,
                        slide_h_in=slide_h_in,
                    )
                else:
                    # 'editable' mode. Z-order: vector design shapes -> images -> text.
                    mapper = SlideMapper(scale, offset_x_in, offset_y_in)
                    drawn_shapes = add_vector_drawings_to_slide(slide, page, mapper)
                    placed_images = add_page_images_to_slide(
                        slide, doc, page, page_dict, mapper, image_cache
                    )

                    if text_groups:
                        add_text_groups_to_slide(
                            slide=slide,
                            text_groups=text_groups,
                            font_name=target_font,
                            scale=scale,
                            offset_x_in=offset_x_in,
                            offset_y_in=offset_y_in,
                            slide_w_in=slide_w_in,
                            slide_h_in=slide_h_in,
                        )
                    elif placed_images == 0 and drawn_shapes == 0:
                        fallback_stream = render_page_to_png_stream(page)
                        slide.shapes.add_picture(
                            fallback_stream,
                            Inches(offset_x_in),
                            Inches(offset_y_in),
                            Inches(rendered_w_in),
                            Inches(rendered_h_in),
                        )

            if add_notes and raw_notes_text:
                slide.notes_slide.notes_text_frame.text = raw_notes_text

        output_buffer = BytesIO()
        prs.save(output_buffer)
        output_buffer.seek(0)
    finally:
        doc.close()

    headers = {
        "Content-Disposition": build_content_disposition(
            file.filename or "converted.pdf"
        )
    }
    return StreamingResponse(
        output_buffer,
        media_type=PPTX_MEDIA_TYPE,
        headers=headers,
    )

