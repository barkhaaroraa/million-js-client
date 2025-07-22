// index.d.ts - TypeScript definitions

export interface ClientOptions {
  baseUrl?: string;
  timeout?: number;
  cacheTtl?: number;
}

export interface PromptMetadata {
  prompt_id: string;
  prompt_name: string;
  prompt_version_id: string;
  version_number: number;
  version_changelog: string;
}

export interface ExperimentMetadata {
  experiment_id: string;
  experiment_name?: string;
  split_type: 'user' | 'session' | 'random';
  identifier_used: string;
}

export interface AssignmentResponse {
  prompt_content: string;
  variant_name: string;
  variant_id: string;
  is_control: boolean;
  assignment_id: string;
  prompt_metadata: PromptMetadata;
  experiment_metadata: ExperimentMetadata;
}

export type Outcome = 'success' | 'failure';
export type UserFeedback = 'positive' | 'negative' | 'neutral';

export interface TrackingOptions {
  experimentId?: string;
  userId?: string;
  sessionId?: string;
  assignmentId?: string;
  score?: number;
  userFeedback?: UserFeedback;
}

export interface EventResponse {
  id: string;
  message?: string;
}

export interface EventFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
  sessionId?: string;
  minScore?: number;
  maxScore?: number;
  feedback?: string;
  outcome?: Outcome;
  page?: number;
  limit?: number;
}

export interface Event {
  id: string;
  experiment_id: string;
  variant_id: string;
  assignment_id: string | null;
  user_id: string | null;
  session_id: string | null;
  outcome: Outcome;
  score: number | null;
  feedback: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface EventsResponse {
  events: Event[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export class LaikaServiceError extends Error {
  name: 'LaikaServiceError';
  statusCode?: number;
  response?: any;
  
  constructor(message: string, statusCode?: number, response?: any);
}

export class NetworkError extends Error {
  name: 'NetworkError';
  originalError?: Error;
  
  constructor(message: string, originalError?: Error);
}

export class ValidationError extends Error {
  name: 'ValidationError';
  
  constructor(message: string);
}

export class AssignmentNotFoundError extends Error {
  name: 'AssignmentNotFoundError';
  
  constructor(message: string);
}

export class LaikaTestClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly cacheTtl: number;

  constructor(apiKey: string, options?: ClientOptions);

  /**
   * Get prompt assignment for a specific user
   */
  getPromptForUser(experimentId: string, userId: string): Promise<AssignmentResponse>;

  /**
   * Get prompt assignment for a specific session
   */
  getPromptForSession(experimentId: string, sessionId: string): Promise<AssignmentResponse>;

  /**
   * Get random prompt assignment
   */
  getRandomPrompt(experimentId: string): Promise<AssignmentResponse>;

  /**
   * Track experiment outcome
   */
  trackOutcome(outcome: Outcome, options?: TrackingOptions): Promise<EventResponse>;

  /**
   * Track successful outcome (convenience method)
   */
  trackSuccess(options?: TrackingOptions): Promise<EventResponse>;

  /**
   * Track failed outcome (convenience method)
   */
  trackFailure(options?: TrackingOptions): Promise<EventResponse>;

  /**
   * Track outcome with user feedback (convenience method)
   */
  trackFeedback(feedback: UserFeedback, options?: TrackingOptions): Promise<EventResponse>;

  /**
   * Get filtered events for an experiment
   */
  getExperimentEvents(experimentId: string, filters?: EventFilters): Promise<EventsResponse>;

  /**
   * Clear assignment cache
   */
  clearCache(): void;

  /**
   * Cleanup resources and stop background processes
   */
  destroy(): void;
}