export const AUTH = {
  BCRYPT_ROUNDS: 10,
  TOKEN_EXPIRY: '7d',
  MIN_PASSWORD_LENGTH: 8,
} as const;

export const VIDEO = {
  SKIP_SECONDS: 10,
  PROGRESS_SAVE_INTERVAL: 10000,
  CONTROLS_TIMEOUT: 3000,
  HIDE_CONTROLS_TIMEOUT: 250,
  CLICK_HIDE_DELAY: 500,
  RESUME_THRESHOLD: 10,
  MAX_FILE_SIZE: 500 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
} as const;

export const FFPROBE = {
  SCENE_THRESHOLD: 0.4,
  THUMBNAIL_WIDTH: 640,
  THUMBNAIL_HEIGHT: 360,
  HLS_TIME: 6,
  QUALITIES: {
    360: { width: 640, height: 360, bitrate: 800 },
    480: { width: 854, height: 480, bitrate: 1200 },
    720: { width: 1280, height: 720, bitrate: 2400 },
  },
} as const;

export const HTTP_STATUS = {
  PARTIAL_CONTENT: 206,
  NOT_FOUND: 404,
} as const;