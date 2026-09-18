# Geometry Guardian

Python FastAPI service for interior geometry QA.

## Setup

```bash
cd services/geometry-guardian
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 8001
```

## Modes

- `basic`: OpenCV edge detection + ORB feature matching
- `advanced`: (future) Grounded SAM 2 segmentation

## API

**POST /check**
```json
{
  "original_path": "/abs/path/to/original.jpg",
  "generated_path": "/abs/path/to/generated.png",
  "project_id": "uuid",
  "style_id": "minimalism",
  "mode": "basic"
}
```

Returns GeometryScore JSON.
