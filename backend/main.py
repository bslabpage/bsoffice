import asyncio
import io
import json
import os
import time
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from google import genai
from google.genai import types

app = FastAPI(title="BOS'S Office PDF to PPTX API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

FONT_MAP = {
    "맑은 고딕 (Malgun Gothic)": "Malgun Gothic",
    "Pretendard": "Pretendard",
    "Arial": "Arial",
    "Calibri": "Calibri",
    "나눔고딕": "NanumGothic",
}

REDACT_IMG_NONE = getattr(fitz, "PDF_REDACT_IMAGE_NONE", 0)
REDACT_LINE_NONE = getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0)


def hex_to_rgb(hex_str: str, default=(0, 0, 0)) -> RGBColor:
    if not hex_str or not isinstance(hex_str, str):
        return RGBColor(*default)
    cleaned = hex_str.strip().lstrip("#")
    if len(cleaned) == 3:
        cleaned = "".join(c * 2 for c in cleaned)
    if len(cleaned) != 6:
        return RGBColor(*default)
    try:
        return RGBColor(
            int(cleaned[0:2], 16),
            int(cleaned[2:4], 16),
            int(cleaned[4:6], 16),
        )
    except ValueError:
        return RGBColor(*default)


def int_to_rgb(color_int: int) -> RGBColor:
    return RGBColor(
        (color_int >> 16) & 255,
        (color_int >> 8) & 255,
        color_int & 255,
    )


def resolve_font_name(font_label: str) -> str:
    if not font_label:
        return "Malgun Gothic"
    for key, val in FONT_MAP.items():
        if key in font_label or val.lower() in font_label.lower():
            return val
    return font_label.split("(")[0].strip() or "Malgun Gothic"


def get_slide_dimensions(aspect_ratio: str, page_rect: fitz.Rect):
    ratio = (aspect_ratio or "16:9").upper()
    if "4:3" in ratio:
        return Pt(720), Pt(540)
    if "A4" in ratio:
        if page_rect.width >= page_rect.height:
            return Pt(841.89), Pt(595.28)
        return Pt(595.28), Pt(841.89)
    return Pt(960), Pt(540)


def make_textless_doc(src_doc: fitz.Document, page_num: int, text_dict: dict) -> fitz.Document:
    temp_doc = fitz.open()
    temp_doc.insert_pdf(src_doc, from_page=page_num, to_page=page_num)
    tpage = temp_doc[0]
    for block in text_dict.get("blocks", []):
        if block.get("type") == 0:
            tpage.add_redact_annot(fitz.Rect(block["bbox"]), fill=False)
    tpage.apply_redactions(images=REDACT_IMG_NONE, graphics=REDACT_LINE_NONE)
    return temp_doc


def extract_raw_text_hints(page: fitz.Page) -> list[dict]:
    pw, ph = page.rect.width, page.rect.height
    hints = []
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = sorted(line.get("spans", []), key=lambda s: s["bbox"][0])
            if not spans:
                continue
            line_text = ""
            prev_x1 = None
            for sp in spans:
                t = sp.get("text", "")
                if not t:
                    continue
                if prev_x1 is not None and (sp["bbox"][0] - prev_x1) > sp.get("size", 10) * 0.18 and not t.startswith(" "):
                    line_text += " "
                line_text += t
                prev_x1 = sp["bbox"][2]
            if not line_text.strip():
                continue
            x0, y0, x1, y1 = line["bbox"]
            first_span = spans[0]
            color_int = first_span.get("color", 0)
            hex_color = "#{:02X}{:02X}{:02X}".format(
                (color_int >> 16) & 255,
                (color_int >> 8) & 255,
                color_int & 255,
            )
            hints.append({
                "text": line_text.strip(),
                "box_2d": [
                    round((y0 / ph) * 1000),
                    round((x0 / pw) * 1000),
                    round((y1 / ph) * 1000),
                    round((x1 / pw) * 1000),
                ],
                "size_pt": round(first_span.get("size", 12), 1),
                "color": hex_color,
                "bold": bool(first_span.get("flags", 0) & 16),
            })
    return hints


def analyze_slide_sync(
    client: genai.Client,
    page_png: bytes,
    text_hints: list[dict],
    merge_paragraphs: bool,
) -> dict:
    merge_rule = (
        "Group closely spaced multi-line body bullets or paragraphs into single logical text boxes separated by newlines (\\n)."
        if merge_paragraphs
        else "Keep each distinct line as a separate text box."
    )

    prompt = f"""
You are a precision presentation layout reconstruction engine.
Analyze the attached slide image and the extracted PDF text hints, and return a JSON blueprint to rebuild this slide as an editable PowerPoint (.pptx) slide.

All `box_2d` coordinates MUST be `[ymin, xmin, ymax, xmax]` normalized on a 0 to 1000 scale.

Return ONLY valid JSON with this exact schema:
{{
  "background_color": "#HEX",
  "shapes": [
    {{
      "shape_type": "rectangle" | "rounded_rectangle" | "oval",
      "box_2d": [ymin, xmin, ymax, xmax],
      "fill_color": "#HEX or null",
      "border_color": "#HEX or null",
      "border_width_pt": 1.0
    }}
  ],
  "photo_regions": [
    {{
      "label": "short description",
      "box_2d": [ymin, xmin, ymax, xmax]
    }}
  ],
  "text_blocks": [
    {{
      "text": "exact text with corrected Korean word spacing",
      "box_2d": [ymin, xmin, ymax, xmax],
      "font_size_pt": 14.0,
      "color": "#HEX",
      "bold": false,
      "align": "left" | "center" | "right"
    }}
  ]
}}

Strict reconstruction rules:
1. `background_color`: Dominant slide canvas color (e.g., "#FCF9F2" or "#FFFFFF").
2. `shapes`: Represent solid colored panels, cards, divider lines, pill badges, and progress bars (such as orange percentage bars and their light background tracks) as clean vector shapes. Do NOT create black boxes over text.
3. `photo_regions`: Identify ONLY real photographs, complex multi-color artwork, or intricate icons that cannot be drawn as simple geometric shapes. Exclude plain solid backgrounds and text.
4. `text_blocks`: Reconstruct ALL visible text on the slide (including white text overlaid on photos). Fix broken spacing between Korean words using natural spacing. {merge_rule}
5. Make `text_blocks` bounding boxes slightly wider than the text so characters never wrap or clip unexpectedly.

Extracted PDF text & coordinate hints:
{json.dumps(text_hints, ensure_ascii=False)}
"""

    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=page_png, mime_type="image/png"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            err_msg = str(e)
            if ("429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg) and attempt < 2:
                time.sleep(12 * (attempt + 1))
                continue
            raise


def norm_to_emu(box_2d: list, slide_w: int, slide_h: int):
    ymin, xmin, ymax, xmax = [max(0.0, min(1000.0, float(v))) for v in box_2d]
    left = int(slide_w * (xmin / 1000.0))
    top = int(slide_h * (ymin / 1000.0))
    width = max(int(Pt(8)), int(slide_w * ((xmax - xmin) / 1000.0)))
    height = max(int(Pt(8)), int(slide_h * ((ymax - ymin) / 1000.0)))
    return left, top, width, height


def apply_ai_layout_to_slide(
    slide,
    doc: fitz.Document,
    page_num: int,
    slide_w: int,
    slide_h: int,
    clean_font: str,
    layout: dict,
):
    page = doc[page_num]
    text_dict = page.get_text("dict")

    bg_hex = layout.get("background_color")
    if bg_hex:
        bg = slide.background
        bg.fill.solid()
        bg.fill.fore_color.rgb = hex_to_rgb(bg_hex, (255, 255, 255))

    shape_map = {
        "rectangle": MSO_SHAPE.RECTANGLE,
        "rounded_rectangle": MSO_SHAPE.ROUNDED_RECTANGLE,
        "oval": MSO_SHAPE.OVAL,
    }
    for sh in layout.get("shapes", []):
        try:
            box = sh.get("box_2d")
            if not box or len(box) != 4:
                continue
            left, top, width, height = norm_to_emu(box, slide_w, slide_h)
            stype = shape_map.get(sh.get("shape_type", "rectangle"), MSO_SHAPE.RECTANGLE)
            shape = slide.shapes.add_shape(stype, left, top, width, height)

            fill_hex = sh.get("fill_color")
            if fill_hex and str(fill_hex).lower() != "null":
                shape.fill.solid()
                shape.fill.fore_color.rgb = hex_to_rgb(fill_hex)
            else:
                shape.fill.background()

            border_hex = sh.get("border_color")
            if border_hex and str(border_hex).lower() != "null":
                shape.line.color.rgb = hex_to_rgb(border_hex)
                shape.line.width = Pt(float(sh.get("border_width_pt", 1.0)))
            else:
                shape.line.fill.background()
        except Exception:
            continue

    photo_regions = layout.get("photo_regions", [])
    if photo_regions:
        temp_doc = make_textless_doc(doc, page_num, text_dict)
        try:
            tpage = temp_doc[0]
            pw, ph = tpage.rect.width, tpage.rect.height
            for pr in photo_regions:
                try:
                    box = pr.get("box_2d")
                    if not box or len(box) != 4:
                        continue
                    ymin, xmin, ymax, xmax = [max(0.0, min(1000.0, float(v))) for v in box]
                    clip_rect = fitz.Rect(
                        pw * (xmin / 1000.0),
                        ph * (ymin / 1000.0),
                        pw * (xmax / 1000.0),
                        ph * (ymax / 1000.0),
                    ) & tpage.rect
                    if clip_rect.is_empty or clip_rect.width < 10 or clip_rect.height < 10:
                        continue
                    crop_pix = tpage.get_pixmap(clip=clip_rect, matrix=fitz.Matrix(2.5, 2.5))
                    left, top, width, height = norm_to_emu(box, slide_w, slide_h)
                    slide.shapes.add_picture(
                        io.BytesIO(crop_pix.tobytes("png")), left, top, width=width, height=height
                    )
                except Exception:
                    continue
        finally:
            temp_doc.close()

    align_map = {
        "left": PP_ALIGN.LEFT,
        "center": PP_ALIGN.CENTER,
        "right": PP_ALIGN.RIGHT,
    }
    scale_ratio = min(
        float(slide_w) / float(Pt(page.rect.width)),
        float(slide_h) / float(Pt(page.rect.height)),
    )

    for tb in layout.get("text_blocks", []):
        try:
            text_val = tb.get("text", "")
            box = tb.get("box_2d")
            if not text_val or not box or len(box) != 4:
                continue
            left, top, width, height = norm_to_emu(box, slide_w, slide_h)
            width += int(Pt(14))
            height += int(Pt(4))

            txBox = slide.shapes.add_textbox(left, top, width, height)
            tf = txBox.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

            lines = str(text_val).split("\n")
            align_val = align_map.get(str(tb.get("align", "left")).lower(), PP_ALIGN.LEFT)
            raw_pt = float(tb.get("font_size_pt", 12.0))
            scaled_pt = max(6.0, raw_pt * scale_ratio)
            rgb_color = hex_to_rgb(tb.get("color", "#000000"))
            is_bold = bool(tb.get("bold", False))

            for idx, line_str in enumerate(lines):
                p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
                p.alignment = align_val
                run = p.add_run()
                run.text = line_str
                run.font.name = clean_font
                run.font.size = Pt(scaled_pt)
                run.font.color.rgb = rgb_color
                run.font.bold = is_bold
        except Exception:
            continue


def build_overlay_slide(
    slide,
    doc: fitz.Document,
    page_num: int,
    slide_w: int,
    slide_h: int,
    clean_font: str,
    do_merge: bool,
):
    page = doc[page_num]
    text_dict = page.get_text("dict")
    pw, ph = page.rect.width, page.rect.height
    scale_x = float(slide_w) / float(Pt(pw))
    scale_y = float(slide_h) / float(Pt(ph))
    font_scale = min(scale_x, scale_y)

    temp_doc = make_textless_doc(doc, page_num, text_dict)
    try:
        pix = temp_doc[0].get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
        slide.shapes.add_picture(
            io.BytesIO(pix.tobytes("png")), 0, 0, width=slide_w, height=slide_h
        )
    finally:
        temp_doc.close()

    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        lines = block.get("lines", [])
        if not lines:
            continue
        line_groups = [lines] if do_merge else [[ln] for ln in lines]
        for grp in line_groups:
            try:
                x0 = min(ln["bbox"][0] for ln in grp)
                y0 = min(ln["bbox"][1] for ln in grp)
                x1 = max(ln["bbox"][2] for ln in grp)
                y1 = max(ln["bbox"][3] for ln in grp)

                left = int(Pt(max(0, x0 * scale_x)))
                top = int(Pt(max(0, y0 * scale_y)))
                width = int(Pt(max(12, (x1 - x0) * scale_x + 16)))
                height = int(Pt(max(10, (y1 - y0) * scale_y + 4)))

                txBox = slide.shapes.add_textbox(left, top, width, height)
                tf = txBox.text_frame
                tf.word_wrap = True
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

                for idx, line in enumerate(grp):
                    p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
                    spans = sorted(line.get("spans", []), key=lambda s: s["bbox"][0])
                    prev_x1 = None
                    for span in spans:
                        txt = span.get("text", "")
                        if not txt:
                            continue
                        sx0, _, sx1, _ = span["bbox"]
                        if (
                            prev_x1 is not None
                            and (sx0 - prev_x1) > span.get("size", 10) * 0.18
                            and not txt.startswith(" ")
                        ):
                            txt = " " + txt
                        prev_x1 = sx1
                        run = p.add_run()
                        run.text = txt
                        run.font.name = clean_font
                        run.font.size = Pt(max(6.0, span.get("size", 12) * font_scale))
                        run.font.color.rgb = int_to_rgb(span.get("color", 0))
                        flags = span.get("flags", 0)
                        run.font.bold = bool(flags & 16)
                        run.font.italic = bool(flags & 2)
            except Exception:
                continue


@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
    }


@app.post("/api/convert-pptx")
async def convert_pdf_to_pptx(
    file: UploadFile = File(...),
    mode: str = Form("editable"),
    font_name: str = Form("Malgun Gothic"),
    aspect_ratio: str = Form("16:9"),
    merge_paragraphs: str = Form("true"),
    add_notes: str = Form("false"),
):
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    prs = Presentation()
    blank_layout = prs.slide_layouts[6]

    clean_font = resolve_font_name(font_name)
    do_merge = str(merge_paragraphs).lower() in ("true", "1", "yes", "on")
    do_notes = str(add_notes).lower() in ("true", "1", "yes", "on")

    slide_w, slide_h = get_slide_dimensions(aspect_ratio, doc[0].rect)
    prs.slide_width = slide_w
    prs.slide_height = slide_h

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    use_ai = mode == "editable" and bool(api_key)

    ai_layouts = [None] * len(doc)
    if use_ai:
        client = genai.Client(api_key=api_key)
        page_inputs = []
        for page in doc:
            png_bytes = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8)).tobytes("png")
            hints = extract_raw_text_hints(page)
            page_inputs.append((png_bytes, hints))

        sem = asyncio.Semaphore(3)

        async def analyze_worker(idx: int, png_bytes: bytes, hints: list[dict]):
            async with sem:
                try:
                    ai_layouts[idx] = await asyncio.to_thread(
                        analyze_slide_sync, client, png_bytes, hints, do_merge
                    )
                except Exception:
                    ai_layouts[idx] = None

        await asyncio.gather(
            *(analyze_worker(i, p_png, p_hints) for i, (p_png, p_hints) in enumerate(page_inputs))
        )

    for page_num, page in enumerate(doc):
        slide = prs.slides.add_slide(blank_layout)

        if mode == "image":
            pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
            slide.shapes.add_picture(
                io.BytesIO(pix.tobytes("png")), 0, 0, width=slide_w, height=slide_h
            )
        elif use_ai and ai_layouts[page_num] is not None:
            try:
                apply_ai_layout_to_slide(
                    slide, doc, page_num, slide_w, slide_h, clean_font, ai_layouts[page_num]
                )
            except Exception:
                build_overlay_slide(slide, doc, page_num, slide_w, slide_h, clean_font, do_merge)
        else:
            build_overlay_slide(slide, doc, page_num, slide_w, slide_h, clean_font, do_merge)

        if do_notes:
            try:
                raw_text = page.get_text("text").strip()
                if raw_text:
                    slide.notes_slide.notes_text_frame.text = raw_text
            except Exception:
                pass

    output = io.BytesIO()
    prs.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": "attachment; filename=converted.pptx"},
    )