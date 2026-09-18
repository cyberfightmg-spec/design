import sys
import os
from PIL import Image, ImageDraw, ImageFont

def main():
    if len(sys.argv) < 5:
        print("Usage: python3 render-badge.py <text> <width> <height> <out_path> [scene_type]")
        sys.exit(1)

    raw_text = sys.argv[1]
    width = int(sys.argv[2])
    height = int(sys.argv[3])
    out_path = sys.argv[4]
    scene_type = sys.argv[5] if len(sys.argv) > 5 else "style"

    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    lines = raw_text.strip().split('\\n')
    if len(lines) == 1:
        lines = raw_text.strip().split('\n')

    font_candidates_black = [
        '/Users/viacheslav/Library/Fonts/SF-Pro-Display-Black.otf',
        '/Users/viacheslav/Library/Fonts/SF-Pro-Display-Bold.otf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    font_candidates_bold = [
        '/Users/viacheslav/Library/Fonts/SF-Pro-Display-Bold.otf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]

    center_x = width // 2

    if scene_type == "intro":
        # First question: bold text with strong stroke outline, centered and compact with safe margins
        max_allowed_w = int(width * 0.75)  # Leave at least 135px padding on left and right
        font_size = 62
        font = None

        # Try to find best font
        selected_font_path = None
        for fp in font_candidates_black:
            if os.path.exists(fp):
                selected_font_path = fp
                break

        # Adjust font size so no line exceeds max_allowed_w
        while font_size >= 40:
            if selected_font_path:
                try:
                    font = ImageFont.truetype(selected_font_path, font_size)
                except Exception:
                    font = ImageFont.load_default()
            else:
                font = ImageFont.load_default()

            line_bboxes = [draw.textbbox((0, 0), l, font=font) for l in lines]
            line_ws = [b[2] - b[0] for b in line_bboxes]
            if max(line_ws) <= max_allowed_w or font_size == 40:
                break
            font_size -= 2

        line_bboxes = [draw.textbbox((0, 0), l, font=font) for l in lines]
        line_ws = [b[2] - b[0] for b in line_bboxes]
        line_hs = [b[3] - b[1] for b in line_bboxes]

        total_h = sum(line_hs) + (len(lines) - 1) * 16
        center_y = int(height * 0.70)  # Position comfortably in lower-middle area

        cur_y = center_y - total_h // 2
        for l, lw, lh, bbox in zip(lines, line_ws, line_hs, line_bboxes):
            lx = center_x - lw // 2 - bbox[0]
            ly = cur_y - bbox[1]
            # Solid black outline for 100% contrast on any background
            draw.text((lx, ly), l, font=font, fill='white', stroke_width=6, stroke_fill=(0, 0, 0, 240))
            cur_y += lh + 16

    else:
        # Style subtitles: oval / pill shape with #4AC890 outline
        font_size = 52
        font = None
        for fp in font_candidates_bold:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, font_size)
                    break
                except Exception:
                    pass
        if not font:
            font = ImageFont.load_default()

        line_bboxes = [draw.textbbox((0, 0), l, font=font) for l in lines]
        line_ws = [b[2] - b[0] for b in line_bboxes]
        line_hs = [b[3] - b[1] for b in line_bboxes]

        max_w = max(line_ws)
        total_h = sum(line_hs) + (len(lines) - 1) * 16

        center_y = int(height * 0.78)

        pad_x = 52
        pad_y = 26
        rx = max_w // 2 + pad_x
        ry = total_h // 2 + pad_y

        oval_box = [center_x - rx, center_y - ry, center_x + rx, center_y + ry]

        # Draw dark semi-transparent pill / oval with #4AC890 outline
        draw.rounded_rectangle(oval_box, radius=ry, fill=(12, 14, 16, 215), outline='#4AC890', width=6)

        cur_y = center_y - total_h // 2
        for l, lw, lh, bbox in zip(lines, line_ws, line_hs, line_bboxes):
            lx = center_x - lw // 2 - bbox[0]
            ly = cur_y - bbox[1]
            draw.text((lx, ly), l, font=font, fill='white')
            cur_y += lh + 16

    img.save(out_path)

if __name__ == '__main__':
    main()
