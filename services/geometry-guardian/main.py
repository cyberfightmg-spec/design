from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pathlib import Path
import traceback
from geometry import analyze_geometry, create_debug_overlay
from config import CONFIG

app = FastAPI(title="Geometry Guardian", version="1.0.0")


class CheckRequest(BaseModel):
    original_path: str
    generated_path: str
    project_id: str
    style_id: str
    mode: str = "basic"


class CheckResponse(BaseModel):
    passed: bool
    score: float
    camera: dict
    structuralLines: dict
    windows: dict
    doors: dict
    cameraDrift: dict
    warnings: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "mode": "basic", "config": CONFIG}


@app.post("/check", response_model=CheckResponse)
def check_geometry(req: CheckRequest):
    # Validate paths
    for path_str, label in [
        (req.original_path, "original"),
        (req.generated_path, "generated"),
    ]:
        if not Path(path_str).exists():
            raise HTTPException(
                status_code=422,
                detail=f"{label} image not found: {path_str}",
            )

    try:
        result = analyze_geometry(req.original_path, req.generated_path)

        # Create debug overlay if enabled
        if CONFIG.get("debugOverlay", True):
            overlay_path = str(
                Path(req.original_path).parent.parent.parent
                / "qa"
                / f"overlay-{req.style_id}.png"
            )
            try:
                create_debug_overlay(
                    req.original_path,
                    req.generated_path,
                    overlay_path,
                    CONFIG.get("debugOverlayOpacity", 0.5),
                )
            except Exception:
                pass  # Overlay is non-critical

        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
