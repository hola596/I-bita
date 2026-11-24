"""FastAPI biometric verification microservice (YuNet + SFace + MiniFASNet ONNX CPU)."""

from __future__ import annotations

import hmac
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

from biometrics import BiometricConfig, BiometricEngine


class Settings(BaseSettings):
    biometric_api_key: str = Field(default="")
    models_dir: Path = Field(default=Path("/app/models"))
    min_similarity_threshold: float = Field(default=0.363)
    min_liveness_threshold: float = Field(default=0.85)
    yunet_score_threshold: float = Field(default=0.6)
    max_image_bytes: int = Field(default=1_048_576)  # 1 MB defensive limit


settings = Settings()
_engine: BiometricEngine | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _engine
    config = BiometricConfig(
        models_dir=settings.models_dir,
        min_similarity_threshold=settings.min_similarity_threshold,
        min_liveness_threshold=settings.min_liveness_threshold,
        yunet_score_threshold=settings.yunet_score_threshold,
    )
    _engine = BiometricEngine(config)
    yield
    _engine = None


app = FastAPI(
    title="I-bita Biometric eKYC Service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


class VerifyIdentityResponse(BaseModel):
    passed: bool
    match: bool
    similarity_score: float
    liveness_score: float
    face_detected_dni: bool
    face_detected_selfie: bool
    reasons: list[str]


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = settings.biometric_api_key.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BIOMETRIC_API_KEY not configured on biometric service.",
        )
    if not x_api_key or not hmac.compare_digest(x_api_key.strip(), expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": _engine is not None,
        "service": "i-bita-biometric-service",
        "models_loaded": [
            "face_detection_yunet_2023mar.onnx",
            "face_recognition_sface_2021dec.onnx",
            "MiniFASNetV2.onnx",
        ],
        "thresholds": {
            "min_similarity_threshold": settings.min_similarity_threshold,
            "min_liveness_threshold": settings.min_liveness_threshold,
        },
    }


@app.post(
    "/api/v1/verify-identity",
    response_model=VerifyIdentityResponse,
    dependencies=[Depends(require_api_key)],
)
async def verify_identity(
    dni_front: UploadFile = File(...),
    selfie: UploadFile = File(...),
    metadata: str = Form(default="{}"),
) -> VerifyIdentityResponse:
    if _engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Biometric engine not initialized.",
        )

    dni_bytes = await dni_front.read()
    selfie_bytes = await selfie.read()

    if not dni_bytes or len(dni_bytes) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dni_front must be between 1 byte and 1 MB.",
        )
    if not selfie_bytes or len(selfie_bytes) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="selfie must be between 1 byte and 1 MB.",
        )

    try:
        parsed_meta = json.loads(metadata) if metadata else {}
        if not isinstance(parsed_meta, dict):
            parsed_meta = {}
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid JSON metadata: {exc.msg}",
        ) from exc

    result = await run_in_threadpool(
        _engine.verify_identity,
        dni_bytes,
        selfie_bytes,
        parsed_meta,
    )

    return VerifyIdentityResponse(
        passed=result.passed,
        match=result.match,
        similarity_score=result.similarity_score,
        liveness_score=result.liveness_score,
        face_detected_dni=result.face_detected_dni,
        face_detected_selfie=result.face_detected_selfie,
        reasons=result.reasons,
    )
