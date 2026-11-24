export type DniGender = "M" | "F" | "X";

export interface ParsedArgentineDni {
  tramiteNumber: string;
  lastName: string;
  firstName: string;
  fullName: string;
  gender: DniGender;
  documentNumber: string;
  documentNumberFormatted: string;
  ejemplar: string;
  birthDate: string; // YYYY-MM-DD
  issueDate: string; // YYYY-MM-DD
  ageYears: number;
  isAdult: boolean;
  rawPayload: string;
}

export type Pdf417ParseResult =
  | { ok: true; data: ParsedArgentineDni }
  | { ok: false; error: string };

export type KycImageKind = "dni-front" | "selfie";

export interface ImageQualityMetrics {
  blurVariance: number;
  glareRatio: number;
  meanBrightness: number;
  width: number;
  height: number;
}

export interface ImageQualityResult {
  ok: boolean;
  reason?: string;
  metrics: ImageQualityMetrics;
}

export interface CompressedKycImage {
  blob: Blob;
  file: File;
  previewUrl: string;
  mimeType: "image/jpeg" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  quality: ImageQualityResult;
}

export type LivenessChallengeType =
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "BLINK"
  | "SMILE";

export interface LivenessChallengeRecord {
  type: LivenessChallengeType;
  label: string;
  completedAt: string;
  peakMetric: number;
}

export interface LivenessCaptureMetadata {
  mode: "mediapipe-active-liveness" | "mock-test-mode";
  challenges: LivenessChallengeRecord[];
  faceCountAtCapture: number;
  yawAtCaptureDeg: number;
  capturedAt: string;
}

export interface BiometricServiceResponse {
  passed: boolean;
  match: boolean;
  similarity_score: number;
  liveness_score: number;
  face_detected_dni: boolean;
  face_detected_selfie: boolean;
  reasons: string[];
}

export type KycVerificationApiStatus =
  | "verified"
  | "rejected"
  | "manual_review";

export interface VerifiedSlotPayload {
  id: string;
  slotIndex: number;
  bookingId: string;
  isPrimaryGuest: boolean;
  inviteToken: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";
  maskedDocumentNumber: string | null;
  fullNameExtracted: string | null;
  biometricConfidenceScore: number | null;
  similarityScore?: number | null;
  livenessScore?: number | null;
  auditHash?: string | null;
  verifiedAt: string | null;
  checkinPath: string;
}

export type VerifyIdentityApiResponse =
  | {
      ok: true;
      status: "verified" | "manual_review";
      message: string;
      similarityScore: number;
      livenessScore: number;
      auditHash: string;
      evidenceExpiresAt: string | null;
      slot: VerifiedSlotPayload;
      bookingId: string;
      bookingStatus: string;
      verifiedAdultsCount: number;
      declaredAdultsCount: number;
      allAdultsVerified: boolean;
    }
  | {
      ok: false;
      status: "rejected";
      error: {
        code: string;
        message: string;
      };
      similarityScore?: number;
      livenessScore?: number;
      reasons?: string[];
      slot?: VerifiedSlotPayload;
      bookingStatus?: string;
      verifiedAdultsCount?: number;
      declaredAdultsCount?: number;
      allAdultsVerified?: boolean;
    };
