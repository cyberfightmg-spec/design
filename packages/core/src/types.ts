// ---- Job & Project States ----
export type ProjectStatus =
  | 'WAITING_IMAGE'
  | 'WAITING_STYLES'
  | 'GENERATING'
  | 'VOICE'
  | 'RENDERING'
  | 'QA_VIDEO'
  | 'COMPLETED'
  | 'FAILED';

export type GenerationStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'GENERATING'
  | 'DOWNLOADING'
  | 'QA'
  | 'PASSED'
  | 'RETRYING'
  | 'FAILED'
  | 'NEEDS_REVIEW';

export type RenderStatus = 'PENDING' | 'RENDERING' | 'COMPLETED' | 'FAILED';

// ---- DB Entities ----
export interface DbUser {
  id: number;
  telegram_user_id: number;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProject {
  id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_progress_message_id: number | null;
  source_image: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface DbProjectStyle {
  id: number;
  project_id: string;
  style_id: string;
  sort_order: number;
  created_at: string;
}

export interface DbGeneration {
  id: string;
  project_id: string;
  style_id: string;
  attempt: number;
  status: GenerationStatus;
  image_path: string | null;
  prompt: string | null;
  geometry_score: number | null;
  geometry_report: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface DbQaResult {
  id: number;
  generation_id: string;
  passed: boolean;
  score: number;
  camera_score: number | null;
  lines_score: number | null;
  windows_score: number | null;
  doors_score: number | null;
  warnings: string | null;
  created_at: string;
}

export interface DbRender {
  id: string;
  project_id: string;
  status: RenderStatus;
  storyboard_path: string | null;
  output_path: string | null;
  duration_sec: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Geometry Score ----
export interface GeometryComponentScore {
  score: number;
  details?: string;
}

export interface GeometryCameraDrift {
  translationX: number;
  translationY: number;
  rotation: number;
  scale: number;
  perspectiveChange: number;
}

export interface GeometryScore {
  passed: boolean;
  score: number;
  camera: GeometryComponentScore;
  structuralLines: GeometryComponentScore;
  windows: GeometryComponentScore;
  doors: GeometryComponentScore;
  cameraDrift: GeometryCameraDrift;
  warnings: string[];
}

// ---- Image Provider ----
export interface GenerationInput {
  projectId: string;
  styleId: string;
  attempt: number;
  originalImagePath: string;
  prompt: string;
  isRetry: boolean;
  previousFailureReason?: string;
}

export interface GenerationResult {
  success: boolean;
  imagePath?: string;
  error?: string;
  requiresAuth?: boolean;
}

// ---- Voice ----
export interface AudioResult {
  success: boolean;
  filePath?: string;
  durationSec?: number;
  error?: string;
  cached?: boolean;
}

// ---- Storyboard ----
export interface StoryboardScene {
  type: 'intro' | 'style';
  styleId?: string;
  image: string;
  text: string;
  voice: string;
  durationSec: number;
}

export interface Storyboard {
  projectId: string;
  width: number;
  height: number;
  fps: number;
  cameraMovement: false;
  totalDurationSec: number;
  scenes: StoryboardScene[];
}

// ---- Logger ----
export interface LogContext {
  projectId?: string;
  styleId?: string;
  jobId?: string;
  attempt?: number;
  [key: string]: unknown;
}

// ---- Config ----
export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  introDurationSec: number;
  minStyleDurationSec: number;
  voicePaddingSec: number;
  transitionFrames: number;
  transitionType: 'dissolve' | 'cut';
  textY: number;
  textSize: number;
  textColor: string;
  textShadowBlur: number;
  textShadowColor: string;
  introTextLine1: string;
  introTextLine2: string;
  bgmEnabled: boolean;
  bgmFile: string | null;
  bgmVolume: number;
  voiceVolume: number;
  objectFit: 'contain' | 'cover';
  backgroundFill: string;
  outputCodec: string;
  outputAudioCodec: string;
  outputPreset: string;
  outputCrf: number;
  outputMovflags: string;
}

export interface GeometryConfig {
  translationThresholdPct: number;
  rotationThresholdDeg: number;
  scaleThresholdPct: number;
  perspectiveDriftMax: number;
  passScore: number;
  reviewScore: number;
  failScore: number;
  featureMatchMinInliers: number;
  cannyLow: number;
  cannyHigh: number;
  houghThreshold: number;
  houghMinLineLength: number;
  houghMaxLineGap: number;
  lightGlueEnabled: boolean;
  debugOverlay: boolean;
  debugOverlayOpacity: number;
}
