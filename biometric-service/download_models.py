"""Build-time downloader for Apache 2.0 / MIT commercial-safe ONNX models."""

from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NamedTuple


class ModelSpec(NamedTuple):
    filename: str
    license_name: str
    min_bytes: int
    urls: tuple[str, ...]


MODEL_SPECS: tuple[ModelSpec, ...] = (
    ModelSpec(
        filename="face_detection_yunet_2023mar.onnx",
        license_name="MIT (OpenCV Zoo)",
        min_bytes=150_000,
        urls=(
            "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        ),
    ),
    ModelSpec(
        filename="face_recognition_sface_2021dec.onnx",
        license_name="Apache-2.0 (OpenCV Zoo)",
        min_bytes=20_000_000,
        urls=(
            "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        ),
    ),
    ModelSpec(
        filename="MiniFASNetV2.onnx",
        license_name="Apache-2.0 (Silent-Face-Anti-Spoofing)",
        min_bytes=1_000_000,
        urls=(
            "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV2.onnx",
            "https://github.com/QingHeYang/Silent-Face-Anti-Spoofing-onnx/raw/main/onnx/2.7_80x80_MiniFASNetV2.onnx",
        ),
    ),
    ModelSpec(
        filename="MiniFASNetV1SE.onnx",
        license_name="Apache-2.0 (Silent-Face-Anti-Spoofing)",
        min_bytes=1_000_000,
        urls=(
            "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV1SE.onnx",
            "https://github.com/QingHeYang/Silent-Face-Anti-Spoofing-onnx/raw/main/onnx/4_0_0_80x80_MiniFASNetV1SE.onnx",
        ),
    ),
)


def download_file(url: str, destination: Path, min_bytes: int) -> None:
    tmp_path = destination.with_suffix(".onnx.part")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "i-bita-biometric-builder/1.0"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        status = getattr(resp, "status", 200)
        if status >= 400:
            raise RuntimeError(f"HTTP {status} from {url}")
        with tmp_path.open("wb") as handle:
            while True:
                chunk = resp.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)

    size = tmp_path.stat().st_size
    if size < min_bytes:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"Downloaded file too small ({size} bytes < {min_bytes} expected) from {url}"
        )

    tmp_path.replace(destination)


def ensure_models(models_dir: Path) -> None:
    models_dir.mkdir(parents=True, exist_ok=True)

    for spec in MODEL_SPECS:
        dest = models_dir / spec.filename
        if dest.exists() and dest.stat().st_size >= spec.min_bytes:
            print(
                f"[MODELS] OK cached {spec.filename} ({dest.stat().st_size} bytes) [{spec.license_name}]"
            )
            continue

        last_err: Exception | None = None
        for url in spec.urls:
            for attempt in range(1, 4):
                try:
                    print(
                        f"[MODELS] Downloading {spec.filename} [{spec.license_name}] attempt {attempt}/3..."
                    )
                    download_file(url, dest, spec.min_bytes)
                    print(
                        f"[MODELS] Downloaded {spec.filename} ({dest.stat().st_size} bytes)"
                    )
                    last_err = None
                    break
                except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
                    last_err = exc
                    print(
                        f"[MODELS] Retryable error for {spec.filename} from {url}: {exc}",
                        file=sys.stderr,
                    )
                    time.sleep(attempt * 1.5)
            if last_err is None:
                break

        if last_err is not None:
            raise RuntimeError(
                f"Failed to download required ONNX model {spec.filename}: {last_err}"
            ) from last_err


if __name__ == "__main__":
    target_dir = Path(os.environ.get("MODELS_DIR", "/app/models"))
    ensure_models(target_dir)
    print("[MODELS] All commercial-safe ONNX models ready.")
