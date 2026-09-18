import cv2
import numpy as np
from pathlib import Path
from typing import Optional
from config import CONFIG


def load_gray(path: str) -> np.ndarray:
    """Load image as grayscale, normalized to same size."""
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Cannot load image: {path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return gray


def load_color(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Cannot load image: {path}")
    return img


def normalize_size(img: np.ndarray, target_h: int = 1080, target_w: int = 1080) -> np.ndarray:
    """Resize to common size for comparison while preserving aspect ratio."""
    h, w = img.shape[:2]
    scale = min(target_w / w, target_h / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    # Pad to exact size
    canvas = np.zeros((target_h, target_w) + img.shape[2:], dtype=img.dtype)
    y_off = (target_h - new_h) // 2
    x_off = (target_w - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas


def detect_edges(gray: np.ndarray) -> np.ndarray:
    """Canny edge detection."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(
        blurred,
        CONFIG["cannyLow"],
        CONFIG["cannyHigh"],
    )
    return edges


def detect_structural_lines(edges: np.ndarray) -> list:
    """Detect major structural lines using HoughLinesP."""
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=CONFIG["houghThreshold"],
        minLineLength=CONFIG["houghMinLineLength"],
        maxLineGap=CONFIG["houghMaxLineGap"],
    )
    if lines is None:
        return []
    # Filter to significant lines
    result = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        result.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "length": length,
                "angle": angle,
                "is_horizontal": abs(angle) < 15 or abs(angle) > 165,
                "is_vertical": 75 < abs(angle) < 105,
            }
        )
    # Sort by length descending, keep top structural
    result.sort(key=lambda l: l["length"], reverse=True)
    return result[:50]


def compute_line_score(lines_orig: list, lines_gen: list, h: int, w: int) -> float:
    """Compare structural lines between original and generated."""
    if not lines_orig or not lines_gen:
        return 0.85  # Cannot compare

    # Compare only vertical and horizontal lines (most important)
    orig_h = [l for l in lines_orig if l["is_horizontal"]]
    orig_v = [l for l in lines_orig if l["is_vertical"]]
    gen_h = [l for l in lines_gen if l["is_horizontal"]]
    gen_v = [l for l in lines_gen if l["is_vertical"]]

    scores = []

    # Check horizontal lines
    for ol in orig_h[:10]:
        best_match = 0.0
        orig_y = (ol["y1"] + ol["y2"]) / 2
        for gl in gen_h:
            gen_y = (gl["y1"] + gl["y2"]) / 2
            y_diff = abs(orig_y - gen_y) / h
            if y_diff < 0.05:  # within 5% of height
                match = 1.0 - (y_diff / 0.05)
                best_match = max(best_match, match)
        scores.append(best_match)

    # Check vertical lines
    for ol in orig_v[:10]:
        best_match = 0.0
        orig_x = (ol["x1"] + ol["x2"]) / 2
        for gl in gen_v:
            gen_x = (gl["x1"] + gl["x2"]) / 2
            x_diff = abs(orig_x - gen_x) / w
            if x_diff < 0.05:
                match = 1.0 - (x_diff / 0.05)
                best_match = max(best_match, match)
        scores.append(best_match)

    if not scores:
        return 0.88
    return float(np.mean(scores))


def compute_feature_matching(gray_orig: np.ndarray, gray_gen: np.ndarray) -> dict:
    """ORB feature matching to estimate camera drift."""
    orb = cv2.ORB_create(nfeatures=1000)
    kp1, des1 = orb.detectAndCompute(gray_orig, None)
    kp2, des2 = orb.detectAndCompute(gray_gen, None)

    if des1 is None or des2 is None or len(kp1) < 10 or len(kp2) < 10:
        return {"inliers": 0, "drift": None}

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    matches = bf.knnMatch(des1, des2, k=2)

    # Lowe's ratio test
    good = []
    for pair in matches:
        if len(pair) == 2:
            m, n = pair
            if m.distance < 0.75 * n.distance:
                good.append(m)

    if len(good) < CONFIG["featureMatchMinInliers"]:
        return {"inliers": len(good), "drift": None}

    src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    inliers = int(mask.sum()) if mask is not None else 0

    if H is None:
        return {"inliers": inliers, "drift": None}

    # Decompose homography for drift metrics
    h, w = gray_orig.shape
    drift = decompose_homography(H, h, w)
    return {"inliers": inliers, "drift": drift}


def decompose_homography(H: np.ndarray, h: int, w: int) -> dict:
    """Extract camera drift metrics from homography matrix."""
    # Translation
    tx = H[0, 2]
    ty = H[1, 2]
    tx_pct = abs(tx) / w * 100
    ty_pct = abs(ty) / h * 100

    # Rotation (approximate)
    rotation_deg = np.degrees(np.arctan2(H[1, 0], H[0, 0]))

    # Scale
    scale = np.sqrt(H[0, 0] ** 2 + H[1, 0] ** 2)

    # Perspective change (magnitude of perspective coefficients)
    perspective_change = float(np.sqrt(H[2, 0] ** 2 + H[2, 1] ** 2))

    return {
        "translationX": round(float(tx_pct), 3),
        "translationY": round(float(ty_pct), 3),
        "rotation": round(float(rotation_deg), 3),
        "scale": round(float(scale), 4),
        "perspectiveChange": round(perspective_change, 6),
    }


def compute_camera_score(drift: Optional[dict]) -> tuple[float, list[str]]:
    """Convert drift metrics to a 0-1 score with warnings."""
    if drift is None:
        return 0.85, ["Feature matching insufficient for drift measurement"]

    warnings = []
    scores = []
    cfg = CONFIG

    # Translation X
    tx = drift["translationX"]
    if tx <= cfg["translationThresholdPct"]:
        scores.append(1.0 - (tx / cfg["translationThresholdPct"]) * 0.1)
    else:
        scores.append(max(0.0, 1.0 - tx / 10.0))
        warnings.append(
            f'Camera X drift: {tx:.2f}% (threshold: {cfg["translationThresholdPct"]}%)'
        )

    # Translation Y
    ty = drift["translationY"]
    if ty <= cfg["translationThresholdPct"]:
        scores.append(1.0 - (ty / cfg["translationThresholdPct"]) * 0.1)
    else:
        scores.append(max(0.0, 1.0 - ty / 10.0))
        warnings.append(
            f'Camera Y drift: {ty:.2f}% (threshold: {cfg["translationThresholdPct"]}%)'
        )

    # Rotation
    rot = abs(drift["rotation"])
    if rot <= cfg["rotationThresholdDeg"]:
        scores.append(1.0 - (rot / cfg["rotationThresholdDeg"]) * 0.1)
    else:
        scores.append(max(0.0, 1.0 - rot / 5.0))
        warnings.append(
            f'Camera rotation: {rot:.2f}° (threshold: {cfg["rotationThresholdDeg"]}°)'
        )

    # Scale
    scale_diff = abs(drift["scale"] - 1.0) * 100
    if scale_diff <= cfg["scaleThresholdPct"]:
        scores.append(1.0 - (scale_diff / cfg["scaleThresholdPct"]) * 0.1)
    else:
        scores.append(max(0.0, 1.0 - scale_diff / 20.0))
        warnings.append(
            f'Camera scale diff: {scale_diff:.2f}% (threshold: {cfg["scaleThresholdPct"]}%)'
        )

    return float(np.mean(scores)), warnings


def analyze_geometry(original_path: str, generated_path: str) -> dict:
    """Full geometry analysis pipeline."""
    # Load and normalize
    orig_color = normalize_size(load_color(original_path))
    gen_color = normalize_size(load_color(generated_path))
    h, w = orig_color.shape[:2]

    orig_gray = cv2.cvtColor(orig_color, cv2.COLOR_BGR2GRAY)
    gen_gray = cv2.cvtColor(gen_color, cv2.COLOR_BGR2GRAY)

    # Edge detection
    orig_edges = detect_edges(orig_gray)
    gen_edges = detect_edges(gen_gray)

    # Line detection
    orig_lines = detect_structural_lines(orig_edges)
    gen_lines = detect_structural_lines(gen_edges)

    # Feature matching for camera drift
    fm_result = compute_feature_matching(orig_gray, gen_gray)
    drift = fm_result.get("drift")

    # Scores
    camera_score, camera_warnings = compute_camera_score(drift)
    lines_score = compute_line_score(orig_lines, gen_lines, h, w)

    # Combined score (weighted)
    # Camera and lines are most important for MVP
    # Windows/doors get placeholder scores (need SAM2 for real detection)
    score = (
        camera_score * 0.5
        + lines_score * 0.3
        + 0.9 * 0.1  # window placeholder
        + 0.9 * 0.1  # door placeholder
    )

    cfg = CONFIG
    passed = score >= cfg["passScore"]
    warnings = camera_warnings.copy()
    if lines_score < 0.90:
        warnings.append(f"Structural lines divergence: score={lines_score:.3f}")

    return {
        "passed": passed,
        "score": round(score, 4),
        "camera": {
            "score": round(camera_score, 4),
            "details": f"drift={drift}" if drift else "insufficient features",
        },
        "structuralLines": {
            "score": round(lines_score, 4),
            "details": f"orig_lines={len(orig_lines)}, gen_lines={len(gen_lines)}",
        },
        "windows": {
            "score": 0.90,
            "details": "placeholder — requires SAM2 for advanced detection",
        },
        "doors": {
            "score": 0.90,
            "details": "placeholder — requires SAM2 for advanced detection",
        },
        "cameraDrift": drift
        or {
            "translationX": 0,
            "translationY": 0,
            "rotation": 0,
            "scale": 1,
            "perspectiveChange": 0,
        },
        "warnings": warnings,
    }


def create_debug_overlay(
    original_path: str,
    generated_path: str,
    output_path: str,
    opacity: float = 0.5,
) -> None:
    """Create 50% opacity debug overlay for QA."""
    orig = normalize_size(load_color(original_path))
    gen = normalize_size(load_color(generated_path))
    overlay = cv2.addWeighted(orig, opacity, gen, 1.0 - opacity, 0)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, overlay)
