# I-bita Biometric eKYC Microservice (CPU / Open Source Commercial-Safe)

Microservicio FastAPI en Python + ONNX Runtime (CPU) para validación facial 1:1 y Anti-Spoofing pasivo, usando exclusivamente modelos compatibles con uso comercial (**MIT / Apache 2.0**):

- **Detección facial:** OpenCV Zoo `YuNet` (`face_detection_yunet_2023mar.onnx`, MIT)
- **Comparación 1:1 (Coseno):** OpenCV Zoo `SFace` (`face_recognition_sface_2021dec.onnx`, Apache 2.0)
- **Liveness Pasivo (Anti-Spoofing Nivel 1):** `MiniFASNetV2` + `MiniFASNetV1SE` ONNX (`Silent-Face-Anti-Spoofing`, Apache 2.0)

## Variables de entorno
- `BIOMETRIC_API_KEY`: clave secreta obligatoria validada en el header `X-API-Key`
- `MIN_SIMILARITY_THRESHOLD` (default `0.363`)
- `MIN_LIVENESS_THRESHOLD` (default `0.85`)
- `YUNET_SCORE_THRESHOLD` (default `0.6`)

## Build & Run con Docker
```bash
cd biometric-service
docker build -t ibita-biometric-service .
docker run -d -p 8000:8000 \
  -e BIOMETRIC_API_KEY="tu-clave-secreta-de-32-caracteres" \
  -e MIN_SIMILARITY_THRESHOLD=0.363 \
  -e MIN_LIVENESS_THRESHOLD=0.85 \
  ibita-biometric-service
```

## Endpoint
- `GET /health`
- `POST /api/v1/verify-identity` (`X-API-Key` + `multipart/form-data` con `dni_front`, `selfie`, `metadata`)
