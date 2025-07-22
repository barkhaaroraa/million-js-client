// laika-test-client.js

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Custom Error Classes
 */
class LaikaServiceError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name = 'LaikaServiceError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

class NetworkError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class AssignmentNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssignmentNotFoundError';
  }
}

/**
 * Assignment Storage with TTL
 */
class AssignmentCache {
  constructor(ttlMs = 30 * 60 * 1000) { // 30 minutes default
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  _generateKey(experimentId, userId, sessionId) {
    const userKey = userId || 'null';
    const sessionKey = sessionId || 'null';
    return `${experimentId}:${userKey}:${sessionKey}`;
  }

  store(experimentId, userId, sessionId, assignment) {
    const key = this._generateKey(experimentId, userId, sessionId);
    const expiresAt = Date.now() + this.ttl;
    
    this.cache.set(key, {
      assignment,
      expiresAt
    });
  }

  get(experimentId, userId, sessionId) {
    const key = this._generateKey(experimentId, userId, sessionId);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.assignment;
  }

  clear() {
    this.cache.clear();
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Main Client Class
 */
class LaikaTestClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new ValidationError('API key is required');
    }

    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://api.laikatest.com';
    this.timeout = options.timeout || 10000; // 10 seconds
    this.cacheTtl = options.cacheTtl || 30 * 60 * 1000; // 30 minutes
    
    this.assignmentCache = new AssignmentCache(this.cacheTtl);
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.assignmentCache.cleanup();
    }, 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  /**
   * Make HTTP request
   */
  _makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'LaikaTestClient/1.0.0'
        },
        timeout: this.timeout
      };

      if (data) {
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }

      const req = httpModule.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const errorMessage = parsed.error || `HTTP ${res.statusCode}`;
              reject(new LaikaServiceError(errorMessage, res.statusCode, parsed));
            }
          } catch (parseError) {
            reject(new NetworkError('Invalid JSON response', parseError));
          }
        });
      });

      req.on('error', (error) => {
        reject(new NetworkError('Network request failed', error));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new NetworkError('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Get prompt for user-based assignment
   */
  async getPromptForUser(experimentId, userId) {
    if (!experimentId) {
      throw new ValidationError('experimentId is required');
    }
    if (!userId) {
      throw new ValidationError('userId is required');
    }

    // Check cache first
    const cached = this.assignmentCache.get(experimentId, userId, null);
    if (cached) {
      return cached;
    }

    const requestData = {
      split_type: 'user',
      user_id: userId
    };

    try {
      const response = await this._makeRequest('POST', `/api/v1/experiments/${experimentId}/prompt`, requestData);
      
      if (!response.success || !response.data) {
        throw new LaikaServiceError('Invalid response format');
      }

      // Store in cache
      this.assignmentCache.store(experimentId, userId, null, response.data);
      
      return response.data;
    } catch (error) {
      if (error instanceof LaikaServiceError || error instanceof NetworkError) {
        throw error;
      }
      throw new LaikaServiceError('Failed to get prompt assignment', null, error);
    }
  }

  /**
   * Get prompt for session-based assignment
   */
  async getPromptForSession(experimentId, sessionId) {
    if (!experimentId) {
      throw new ValidationError('experimentId is required');
    }
    if (!sessionId) {
      throw new ValidationError('sessionId is required');
    }

    // Check cache first
    const cached = this.assignmentCache.get(experimentId, null, sessionId);
    if (cached) {
      return cached;
    }

    const requestData = {
      split_type: 'session',
      session_id: sessionId
    };

    try {
      const response = await this._makeRequest('POST', `/api/v1/experiments/${experimentId}/prompt`, requestData);
      
      if (!response.success || !response.data) {
        throw new LaikaServiceError('Invalid response format');
      }

      // Store in cache
      this.assignmentCache.store(experimentId, null, sessionId, response.data);
      
      return response.data;
    } catch (error) {
      if (error instanceof LaikaServiceError || error instanceof NetworkError) {
        throw error;
      }
      throw new LaikaServiceError('Failed to get prompt assignment', null, error);
    }
  }

  /**
   * Get prompt for random assignment
   */
  async getRandomPrompt(experimentId) {
    if (!experimentId) {
      throw new ValidationError('experimentId is required');
    }

    const requestData = {
      split_type: 'random'
    };

    try {
      const response = await this._makeRequest('POST', `/api/v1/experiments/${experimentId}/prompt`, requestData);
      
      if (!response.success || !response.data) {
        throw new LaikaServiceError('Invalid response format');
      }

      // Don't cache random assignments
      return response.data;
    } catch (error) {
      if (error instanceof LaikaServiceError || error instanceof NetworkError) {
        throw error;
      }
      throw new LaikaServiceError('Failed to get prompt assignment', null, error);
    }
  }

  /**
   * Find assignment in cache for automatic tracking
   */
  _findCachedAssignment(experimentId, userId, sessionId) {
    // Try exact match first
    let assignment = this.assignmentCache.get(experimentId, userId, sessionId);
    if (assignment) {
      return assignment;
    }

    // Try user-based assignment
    if (userId) {
      assignment = this.assignmentCache.get(experimentId, userId, null);
      if (assignment) {
        return assignment;
      }
    }

    // Try session-based assignment
    if (sessionId) {
      assignment = this.assignmentCache.get(experimentId, null, sessionId);
      if (assignment) {
        return assignment;
      }
    }

    return null;
  }

  /**
   * Track outcome with automatic assignment resolution
   */
  async trackOutcome(outcome, options = {}) {
    if (!outcome || !['success', 'failure'].includes(outcome)) {
      throw new ValidationError('outcome must be "success" or "failure"');
    }

    const { experimentId, userId, sessionId, score, userFeedback, assignmentId } = options;

    let assignment;
    let finalAssignmentId;
    let finalExperimentId;

    if (assignmentId && experimentId) {
      // Explicit assignment provided
      finalAssignmentId = assignmentId;
      finalExperimentId = experimentId;
    } else if (experimentId && (userId || sessionId)) {
      // Try to find assignment in cache
      assignment = this._findCachedAssignment(experimentId, userId, sessionId);
      if (!assignment) {
        throw new AssignmentNotFoundError(
          `No assignment found for experiment ${experimentId}. Call getPrompt* method first.`
        );
      }
      finalAssignmentId = assignment.assignment_id;
      finalExperimentId = experimentId;
    } else {
      throw new ValidationError('Either (assignmentId + experimentId) or (experimentId + userId/sessionId) must be provided');
    }

    const eventData = {
      assignment_id: finalAssignmentId,
      outcome: outcome
    };

    // Add optional fields
    if (score !== undefined) {
      if (typeof score !== 'number' || score < 0 || score > 10) {
        throw new ValidationError('score must be a number between 0 and 10');
      }
      eventData.score = score;
    }

    if (userFeedback !== undefined) {
      if (!['positive', 'negative', 'neutral'].includes(userFeedback)) {
        throw new ValidationError('userFeedback must be "positive", "negative", or "neutral"');
      }
      eventData.user_feedback = userFeedback;
    }

    try {
      const response = await this._makeRequest('POST', '/api/v1/events', eventData);
      
      if (!response.success) {
        throw new LaikaServiceError('Failed to track event');
      }

      return response.data;
    } catch (error) {
      if (error instanceof LaikaServiceError || error instanceof NetworkError) {
        throw error;
      }
      throw new LaikaServiceError('Failed to track outcome', null, error);
    }
  }

  /**
   * Track success (convenience method)
   */
  async trackSuccess(options = {}) {
    return this.trackOutcome('success', options);
  }

  /**
   * Track failure (convenience method)
   */
  async trackFailure(options = {}) {
    return this.trackOutcome('failure', options);
  }

  /**
   * Track with user feedback (convenience method)
   */
  async trackFeedback(feedback, options = {}) {
    return this.trackOutcome('success', { ...options, userFeedback: feedback });
  }

  /**
   * Get filtered events for an experiment
   */
  async getExperimentEvents(experimentId, filters = {}) {
    if (!experimentId) {
      throw new ValidationError('experimentId is required');
    }

    const {
      startDate,
      endDate,
      userId,
      sessionId,
      minScore,
      maxScore,
      feedback,
      outcome,
      page = 1,
      limit = 50
    } = filters;

    // Validate pagination
    if (typeof page !== 'number' || page < 1) {
      throw new ValidationError('page must be a positive number');
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 500) {
      throw new ValidationError('limit must be a number between 1 and 500');
    }

    // Validate date formats
    if (startDate && !this._isValidISODate(startDate)) {
      throw new ValidationError('startDate must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)');
    }

    if (endDate && !this._isValidISODate(endDate)) {
      throw new ValidationError('endDate must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)');
    }

    // Validate date range
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      throw new ValidationError('startDate must be before endDate');
    }

    // Validate score range
    if (minScore !== undefined && (typeof minScore !== 'number' || minScore < 0 || minScore > 10)) {
      throw new ValidationError('minScore must be a number between 0 and 10');
    }

    if (maxScore !== undefined && (typeof maxScore !== 'number' || maxScore < 0 || maxScore > 10)) {
      throw new ValidationError('maxScore must be a number between 0 and 10');
    }

    // Validate outcome
    if (outcome && !['success', 'failure'].includes(outcome)) {
      throw new ValidationError('outcome must be "success" or "failure"');
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (userId) queryParams.append('user_id', userId);
    if (sessionId) queryParams.append('session_id', sessionId);
    if (minScore !== undefined) queryParams.append('min_score', minScore.toString());
    if (maxScore !== undefined) queryParams.append('max_score', maxScore.toString());
    if (feedback) queryParams.append('feedback', feedback);
    if (outcome) queryParams.append('outcome', outcome);
    
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());

    const queryString = queryParams.toString();
    const path = `/api/v1/experiments/${experimentId}/events${queryString ? '?' + queryString : ''}`;

    try {
      const response = await this._makeRequest('GET', path);
      
      if (!response.success) {
        throw new LaikaServiceError('Failed to fetch events');
      }

      return {
        events: response.data || [],
        meta: response.meta || { total: 0, page, limit }
      };
    } catch (error) {
      if (error instanceof LaikaServiceError || error instanceof NetworkError) {
        throw error;
      }
      throw new LaikaServiceError('Failed to fetch experiment events', null, error);
    }
  }

  /**
   * Helper method to validate ISO date format
   */
  _isValidISODate(dateString) {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && 
           dateString.includes('T') && 
           (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-'));
  }

  /**
   * Clear assignment cache
   */
  clearCache() {
    this.assignmentCache.clear();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearCache();
  }
}

// Export classes
module.exports = {
  LaikaTestClient,
  LaikaServiceError,
  NetworkError,
  ValidationError,
  AssignmentNotFoundError
};