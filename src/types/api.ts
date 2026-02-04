// API response wrapper format per Architecture

export type ApiSuccessResponse<T> = {
  success: true
  data: T
}

export type ApiErrorCode =
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'INVALID_PAYLOAD'
  | 'PROJECT_NOT_FOUND'
  | 'INTERNAL_ERROR'

export type ApiErrorResponse = {
  success: false
  error: {
    code: ApiErrorCode
    message: string
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

// POST /postUpdate request body
export type PostUpdateRequest = {
  project: string
  workstream: string
  summary: string
  tool: string
  model: string
  modelVersion?: string
  priority?: 'high' | 'medium' | 'low' | 'debug'
}

// POST /postUpdate success response data
export type PostUpdateResponseData = {
  updateId: string
  timestamp: string
}
