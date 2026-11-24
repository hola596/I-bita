"""CPU-optimized OpenCV Zoo (YuNet + SFace) and MiniFASNet ONNX biometric engine."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort


@dataclass(frozen=True)
class BiometricConfig:
    models_dir: Path
    min_similarity_threshold: float = 0.363
    min_liveness_threshold: float = 0.85
    yunet_score_threshold: float = 0.6
    yunet_nms_threshold: float = 0.3


@dataclass(frozen=True)
class VerificationOutput:
    passed: bool
    match: bool
    similarity_score: float
    liveness_score: float
    face_detected_dni: bool
    face_detected_selfie: bool
    reasons: list[str]


class MiniFASNetRunner:
    """Wrapper for Silent-Face-Anti-Spoofing ONNX models (Apache 2.0)."""

    def __init__(self, model_path: Path, scale: float) -> None:
        if not model_path.exists():
            raise FileNotFoundError(f"Missing MiniFASNet ONNX model: {model_path}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self.scale = scale

        input_cfg = self.session.get_inputs()[0]
        self.input_name = input_cfg.name
        shape = input_cfg.shape
        h = int(shape[2]) if len(shape) >= 4 and isinstance(shape[2], int) else 80
        w = int(shape[3]) if len(shape) >= 4 and isinstance(shape[3], int) else 80
        self.input_size_hw = (h, w)
        self.output_name = self.session.get_outputs()[0].name

    def _crop_face_bgr(self, image_bgr: np.ndarray, bbox_xywh: tuple[float, float, float, float]) -> np.ndarray:
        src_h, src_w = image_bgr.shape[:2]
        x, y, box_w, box_h = bbox_xywh
        box_w = max(1.0, box_w)
        box_h = max(1.0, box_h)

        effective_scale = min((src_h - 1) / box_h, (src_w - 1) / box_w, self.scale)
        new_w = box_w * effective_scale
        new_h = box_h * effective_scale

        center_x = x + box_w / 2.0
        center_y = y + box_h / 2.0

        x1 = max(0, int(center_x - new_w / 2.0))
        y1 = max(0, int(center_y - new_h / 2.0))
        x2 = min(src_w - 1, int(center_x + new_w / 2.0))
        y2 = min(src_h - 1, int(center_y + new_h / 2.0))

        cropped = image_bgr[y1 : y2 + 1, x1 : x2 + 1]
        if cropped.size == 0:
            cropped = image_bgr

        target_h, target_w = self.input_size_hw
        return cv2.resize(cropped, (target_w, target_h))

    @staticmethod
    def _softmax(logits: np.ndarray) -> np.ndarray:
        shifted = logits - np.max(logits, axis=1, keepdims=True)
        exp = np.exp(shifted)
        return exp / np.sum(exp, axis=1, keepdims=True)

    def predict_real_probability(
        self,
        image_bgr: np.ndarray,
        bbox_xywh: tuple[float, float, float, float],
    ) -> float:
        # MiniFASNet ONNX espera BGR float32 en rango [0, 255] sin dividir por 255.0
        face = self._crop_face_bgr(image_bgr, bbox_xywh).astype(np.float32)
        tensor = np.transpose(face, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)

        logits = self.session.run([self.output_name], {self.input_name: tensor})[0]
        probs = self._softmax(logits)
        # Índice 1 corresponde a rostro real ("Real") en Silent-Face-Anti-Spoofing
        real_prob = float(probs[0, 1]) if probs.shape[1] > 1 else float(probs[0, 0])
        return max(0.0, min(1.0, real_prob))


class BiometricEngine:
    """Coordinates YuNet face detection, SFace 1:1 cosine matching, and MiniFASNet anti-spoofing."""

    def __init__(self, config: BiometricConfig) -> None:
        self.config = config
        self._lock = threading.Lock()

        yunet_path = config.models_dir / "face_detection_yunet_2023mar.onnx"
        sface_path = config.models_dir / "face_recognition_sface_2021dec.onnx"
        fas_v2_path = config.models_dir / "MiniFASNetV2.onnx"
        fas_v1se_path = config.models_dir / "MiniFASNetV1SE.onnx"

        for required in (yunet_path, sface_path, fas_v2_path):
            if not required.exists():
                raise FileNotFoundError(
                    f"Missing required biometric ONNX model at {required}. Run download_models.py first."
                )

        self.detector = cv2.FaceDetectorYN.create(
            model=str(yunet_path),
            config="",
            input_size=(320, 320),
            score_threshold=config.yunet_score_threshold,
            nms_threshold=config.yunet_nms_threshold,
            top_k=5000,
        )
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=str(sface_path),
            config="",
        )
        self.anti_spoof_runners: list[MiniFASNetRunner] = [
            MiniFASNetRunner(fas_v2_path, scale=2.7),
        ]
        if fas_v1se_path.exists():
            self.anti_spoof_runners.append(MiniFASNetRunner(fas_v1se_path, scale=4.0))

    @staticmethod
    def _decode_bgr(image_bytes: bytes) -> np.ndarray | None:
        if not image_bytes:
            return None
        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            return None
        return image

    def _detect_faces(self, image_bgr: np.ndarray) -> np.ndarray:
        h, w = image_bgr.shape[:2]
        with self._lock:
            self.detector.setInputSize((w, h))
            _, faces = self.detector.detect(image_bgr)
        if faces is None or len(faces) == 0:
            return np.empty((0, 15), dtype=np.float32)

        # Priorizar rostros por área * confianza descendente
        order = sorted(
            range(len(faces)),
            key=lambda idx: float(faces[idx][2] * faces[idx][3] * faces[idx][14]),
            reverse=True,
        )
        return faces[order]

    def _extract_embedding(self, image_bgr: np.ndarray, face_row: np.ndarray) -> np.ndarray:
        with self._lock:
            aligned = self.recognizer.alignCrop(image_bgr, face_row)
            return self.recognizer.feature(aligned)

    def _cosine_similarity(self, emb_a: np.ndarray, emb_b: np.ndarray) -> float:
        with self._lock:
            raw = float(
                self.recognizer.match(
                    emb_a,
                    emb_b,
                    cv2.FaceRecognizerSF_FR_COSINE,
                )
            )
        return max(0.0, min(1.0, raw))

    def _compute_liveness(
        self,
        selfie_bgr: np.ndarray,
        face_row: np.ndarray,
    ) -> float:
        bbox_xywh = (
            float(face_row[0]),
            float(face_row[1]),
            float(face_row[2]),
            float(face_row[3]),
        )
        scores = [
            runner.predict_real_probability(selfie_bgr, bbox_xywh)
            for runner in self.anti_spoof_runners
        ]
        return sum(scores) / max(1, len(scores))

    def verify_identity(
        self,
        dni_front_bytes: bytes,
        selfie_bytes: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> VerificationOutput:
        _ = metadata or {}
        reasons: list[str] = []

        dni_img = self._decode_bgr(dni_front_bytes)
        selfie_img = self._decode_bgr(selfie_bytes)

        if dni_img is None:
            reasons.append("INVALID_IMAGE_DNI")
        if selfie_img is None:
            reasons.append("INVALID_IMAGE_SELFIE")

        if dni_img is None or selfie_img is None:
            return VerificationOutput(
                passed=False,
                match=False,
                similarity_score=0.0,
                liveness_score=0.0,
                face_detected_dni=False,
                face_detected_selfie=False,
                reasons=reasons,
            )

        dni_faces = self._detect_faces(dni_img)
        selfie_faces = self._detect_faces(selfie_img)

        face_detected_dni = len(dni_faces) > 0
        face_detected_selfie = len(selfie_faces) > 0
        single_face_selfie = len(selfie_faces) == 1

        if not face_detected_dni:
            reasons.append("NO_FACE_IN_DNI")
        if not face_detected_selfie:
            reasons.append("NO_FACE_IN_SELFIE")
        elif len(selfie_faces) > 1:
            reasons.append("MULTIPLE_FACES_IN_SELFIE")

        liveness_score = 0.0
        if face_detected_selfie:
            liveness_score = self._compute_liveness(selfie_img, selfie_faces[0])
            if liveness_score < self.config.min_liveness_threshold:
                reasons.append("LIVENESS_FAILED")

        similarity_score = 0.0
        match = False
        if face_detected_dni and face_detected_selfie:
            dni_emb = self._extract_embedding(dni_img, dni_faces[0])
            selfie_emb = self._extract_embedding(selfie_img, selfie_faces[0])
            similarity_score = self._cosine_similarity(dni_emb, selfie_emb)
            match = similarity_score >= self.config.min_similarity_threshold
            if not match:
                reasons.append("FACE_MISMATCH")

        liveness_ok = liveness_score >= self.config.min_liveness_threshold
        passed = bool(
            face_detected_dni
            and face_detected_selfie
            and single_face_selfie
            and liveness_ok
            and match
            and len(reasons) == 0
        )

        return VerificationOutput(
            passed=passed,
            match=match,
            similarity_score=round(similarity_score, 4),
            liveness_score=round(liveness_score, 4),
            face_detected_dni=face_detected_dni,
            face_detected_selfie=face_detected_selfie,
            reasons=reasons,
        )
