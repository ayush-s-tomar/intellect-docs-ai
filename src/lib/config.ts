export const CHUNKING = {
  CHUNK_SIZE: 800,
  OVERLAP: 150,
  MIN_CHUNK_LENGTH: 40,
} as const

export const RETRIEVAL = {
  MATCH_COUNT: 5,
  RRF_K: 60,
} as const

export const CHAT = {
  MAX_HISTORY_MESSAGES: 6,
} as const

export const UPLOAD = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
} as const

export const RATE_LIMIT = {
  CHAT: {
    MAX_REQUESTS: 30,
    WINDOW: '1 m',
  },
  UPLOAD: {
    MAX_REQUESTS: 20,
    WINDOW: '60 m',
  },
  // Each call evaluates one question (2 model calls); 40 per hour is about 5 full runs.
  EVAL: {
    MAX_REQUESTS: 40,
    WINDOW: '60 m',
  },
} as const