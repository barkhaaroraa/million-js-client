// test.js - Simple test suite without external dependencies

const { 
  LaikaTestClient, 
  LaikaServiceError, 
  NetworkError, 
  ValidationError, 
  AssignmentNotFoundError 
} = require('./laika-test-client');

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  console.log(`\n🧪 Test ${testCount}: ${name}`);
  
  try {
    fn();
    passCount++;
    console.log(`✅ PASS`);
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    console.log(error.stack);
  }
}

async function asyncTest(name, fn) {
  testCount++;
  console.log(`\n🧪 Test ${testCount}: ${name}`);
  
  try {
    await fn();
    passCount++;
    console.log(`✅ PASS`);
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    console.log(error.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn, expectedError, message) {
  try {
    fn();
    throw new Error(message || 'Expected function to throw');
  } catch (error) {
    if (expectedError && !(error instanceof expectedError)) {
      throw new Error(`Expected ${expectedError.name}, got ${error.constructor.name}`);
    }
  }
}

async function assertThrowsAsync(fn, expectedError, message) {
  try {
    await fn();
    throw new Error(message || 'Expected function to throw');
  } catch (error) {
    if (expectedError && !(error instanceof expectedError)) {
      throw new Error(`Expected ${expectedError.name}, got ${error.constructor.name}`);
    }
  }
}

// Mock HTTP server for testing
class MockServer {
  constructor() {
    this.responses = new Map();
    this.requests = [];
  }

  setResponse(path, method, response, statusCode = 200) {
    const key = `${method}:${path}`;
    this.responses.set(key, { response, statusCode });
  }

  setFailure(path, method) {
    const key = `${method}:${path}`;
    this.responses.set(key, { failure: true });
  }

  getResponse(path, method) {
    const key = `${method}:${path}`;
    let response = this.responses.get(key);
    
    // If exact match not found, try matching without query parameters
    if (!response && path.includes('?')) {
      const basePath = path.split('?')[0];
      const baseKey = `${method}:${basePath}`;
      response = this.responses.get(baseKey);
    }
    
    return response;
  }

  recordRequest(path, method, data) {
    this.requests.push({ path, method, data, timestamp: Date.now() });
  }

  getRequests() {
    return this.requests;
  }

  clear() {
    this.responses.clear();
    this.requests = [];
  }
}

// Create a test client with mocked HTTP
function createTestClient(mockServer) {
  const client = new LaikaTestClient('test-api-key', {
    baseUrl: 'http://localhost:3001',
    timeout: 1000,
    cacheTtl: 5000 // 5 seconds for testing
  });

  // Override the _makeRequest method to use mock server
  client._makeRequest = async function(method, path, data) {
    mockServer.recordRequest(path, method, data);
    
    const mockResponse = mockServer.getResponse(path, method);
    if (!mockResponse) {
      throw new NetworkError(`No mock response for ${method} ${path}`);
    }

    if (mockResponse.failure) {
      throw new NetworkError('Mock network failure');
    }

    if (mockResponse.statusCode >= 400) {
      throw new LaikaServiceError(
        mockResponse.response.error || 'Mock error',
        mockResponse.statusCode,
        mockResponse.response
      );
    }

    return mockResponse.response;
  };

  return client;
}

// Test Suite
async function runTests() {
  console.log('🚀 Starting Prompt Test Client Test Suite\n');
  
  const mockServer = new MockServer();
  
  // Test 1: Constructor validation
  test('Constructor requires API key', () => {
    assertThrows(() => new LaikaTestClient(), ValidationError);
    assertThrows(() => new LaikaTestClient(''), ValidationError);
    assertThrows(() => new LaikaTestClient(null), ValidationError);
  });

  // Test 2: Constructor with valid API key
  test('Constructor with valid API key', () => {
    const client = new LaikaTestClient('test-key');
    assert(client.apiKey === 'test-key');
    assert(client.baseUrl === 'https://api.laikatest.com');
    assert(client.timeout === 10000);
    client.destroy();
  });

  // Test 3: Constructor with options
  test('Constructor with custom options', () => {
    const client = new LaikaTestClient('test-key', {
      baseUrl: 'http://localhost:3001',
      timeout: 5000,
      cacheTtl: 60000
    });
    assert(client.baseUrl === 'http://localhost:3001');
    assert(client.timeout === 5000);
    assert(client.cacheTtl === 60000);
    client.destroy();
  });

  // Test 4: Assignment cache key generation
  test('Assignment cache key generation', () => {
    const client = createTestClient(mockServer);
    const cache = client.assignmentCache;
    
    const key1 = cache._generateKey('exp1', 'user1', null);
    const key2 = cache._generateKey('exp1', null, 'session1');
    const key3 = cache._generateKey('exp1', 'user1', 'session1');
    
    assertEqual(key1, 'exp1:user1:null');
    assertEqual(key2, 'exp1:null:session1');
    assertEqual(key3, 'exp1:user1:session1');
    
    client.destroy();
  });

  // Test 5: Assignment cache store and retrieve
  test('Assignment cache operations', () => {
    const client = createTestClient(mockServer);
    const cache = client.assignmentCache;
    
    const assignment = { assignment_id: 'test-id', prompt_content: 'test prompt' };
    
    // Store assignment
    cache.store('exp1', 'user1', null, assignment);
    
    // Retrieve assignment
    const retrieved = cache.get('exp1', 'user1', null);
    assert(retrieved !== null);
    assertEqual(retrieved.assignment_id, 'test-id');
    
    // Non-existent assignment
    const notFound = cache.get('exp2', 'user1', null);
    assert(notFound === null);
    
    client.destroy();
  });

  // Test 6: User-based prompt assignment
  await asyncTest('User-based prompt assignment', async () => {
    const client = createTestClient(mockServer);
    
    // Mock successful response
    const mockAssignment = {
      success: true,
      data: {
        prompt_content: 'You are a helpful assistant',
        variant_name: 'control',
        assignment_id: 'assign-123',
        experiment_metadata: { experiment_id: 'exp-123' }
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-123/prompt', 'POST', mockAssignment);
    
    const result = await client.getPromptForUser('exp-123', 'user-456');
    
    assertEqual(result.prompt_content, 'You are a helpful assistant');
    assertEqual(result.variant_name, 'control');
    assertEqual(result.assignment_id, 'assign-123');
    
    // Verify request was made correctly
    const requests = mockServer.getRequests();
    assertEqual(requests.length, 1);
    assertEqual(requests[0].method, 'POST');
    assertEqual(requests[0].data.split_type, 'user');
    assertEqual(requests[0].data.user_id, 'user-456');
    
    client.destroy();
    mockServer.clear();
  });

  // Test 7: Session-based prompt assignment
  await asyncTest('Session-based prompt assignment', async () => {
    const client = createTestClient(mockServer);
    
    const mockAssignment = {
      success: true,
      data: {
        prompt_content: 'You are a session assistant',
        variant_name: 'variant_a',
        assignment_id: 'assign-789'
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-456/prompt', 'POST', mockAssignment);
    
    const result = await client.getPromptForSession('exp-456', 'session-abc');
    
    assertEqual(result.prompt_content, 'You are a session assistant');
    assertEqual(result.assignment_id, 'assign-789');
    
    client.destroy();
    mockServer.clear();
  });

  // Test 8: Random prompt assignment
  await asyncTest('Random prompt assignment', async () => {
    const client = createTestClient(mockServer);
    
    const mockAssignment = {
      success: true,
      data: {
        prompt_content: 'Random prompt',
        variant_name: 'random_variant',
        assignment_id: 'assign-random'
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-random/prompt', 'POST', mockAssignment);
    
    const result = await client.getRandomPrompt('exp-random');
    
    assertEqual(result.prompt_content, 'Random prompt');
    
    // Verify correct request
    const requests = mockServer.getRequests();
    assertEqual(requests[0].data.split_type, 'random');
    assert(!requests[0].data.user_id);
    assert(!requests[0].data.session_id);
    
    client.destroy();
    mockServer.clear();
  });

  // Test 9: Caching behavior
  await asyncTest('Assignment caching', async () => {
    const client = createTestClient(mockServer);
    
    const mockAssignment = {
      success: true,
      data: {
        prompt_content: 'Cached prompt',
        assignment_id: 'cached-123'
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-cache/prompt', 'POST', mockAssignment);
    
    // First call should hit API
    await client.getPromptForUser('exp-cache', 'user-cache');
    assertEqual(mockServer.getRequests().length, 1);
    
    // Second call should use cache
    await client.getPromptForUser('exp-cache', 'user-cache');
    assertEqual(mockServer.getRequests().length, 1); // No additional request
    
    client.destroy();
    mockServer.clear();
  });

  // Test 10: Event tracking with automatic assignment resolution
  await asyncTest('Event tracking with auto resolution', async () => {
    const client = createTestClient(mockServer);
    
    // First get an assignment
    const mockAssignment = {
      success: true,
      data: {
        prompt_content: 'Test prompt',
        assignment_id: 'track-123'
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-track/prompt', 'POST', mockAssignment);
    await client.getPromptForUser('exp-track', 'user-track');
    
    // Then track an event
    const mockEventResponse = {
      success: true,
      data: { id: 'event-123' }
    };
    
    mockServer.setResponse('/api/v1/events', 'POST', mockEventResponse);
    
    await client.trackSuccess({
      experimentId: 'exp-track',
      userId: 'user-track',
      score: 8.5,
      userFeedback: 'positive'
    });
    
    // Verify event request
    const requests = mockServer.getRequests();
    const eventRequest = requests.find(r => r.path === '/api/v1/events');
    assert(eventRequest !== undefined);
    assertEqual(eventRequest.data.assignment_id, 'track-123');
    assertEqual(eventRequest.data.outcome, 'success');
    assertEqual(eventRequest.data.score, 8.5);
    assertEqual(eventRequest.data.user_feedback, 'positive');
    
    client.destroy();
    mockServer.clear();
  });

  // Test 11: Error handling - validation errors
  await asyncTest('Validation error handling', async () => {
    const client = createTestClient(mockServer);
    
    // Missing experiment ID
    await assertThrowsAsync(
      () => client.getPromptForUser('', 'user-123'),
      ValidationError
    );
    
    // Missing user ID
    await assertThrowsAsync(
      () => client.getPromptForUser('exp-123', ''),
      ValidationError
    );
    
    // Invalid outcome
    await assertThrowsAsync(
      () => client.trackOutcome('invalid'),
      ValidationError
    );
    
    // Invalid score
    await assertThrowsAsync(
      () => client.trackOutcome('success', { score: 15 }),
      ValidationError
    );
    
    // Invalid user feedback
    await assertThrowsAsync(
      () => client.trackOutcome('success', { userFeedback: 'invalid' }),
      ValidationError
    );
    
    client.destroy();
  });

  // Test 12: Error handling - assignment not found
  await asyncTest('Assignment not found error', async () => {
    const client = createTestClient(mockServer);
    
    // Try to track without getting assignment first
    await assertThrowsAsync(
      () => client.trackSuccess({
        experimentId: 'exp-notfound',
        userId: 'user-notfound'
      }),
      AssignmentNotFoundError
    );
    
    client.destroy();
  });

  // Test 13: Error handling - service errors
  await asyncTest('Service error handling', async () => {
    const client = createTestClient(mockServer);
    
    // Mock error response
    mockServer.setResponse(
      '/api/v1/experiments/exp-error/prompt',
      'POST',
      { success: false, error: 'Experiment not found' },
      404
    );
    
    await assertThrowsAsync(
      () => client.getPromptForUser('exp-error', 'user-123'),
      LaikaServiceError
    );
    
    client.destroy();
    mockServer.clear();
  });

  // Test 14: Convenience methods
  await asyncTest('Convenience methods', async () => {
    const client = createTestClient(mockServer);
    
    // Setup assignment
    const mockAssignment = {
      success: true,
      data: { assignment_id: 'convenience-123' }
    };
    mockServer.setResponse('/api/v1/experiments/exp-conv/prompt', 'POST', mockAssignment);
    await client.getPromptForUser('exp-conv', 'user-conv');
    
    // Setup event response
    const mockEventResponse = { success: true, data: { id: 'event-123' } };
    mockServer.setResponse('/api/v1/events', 'POST', mockEventResponse);
    
    // Test trackFailure
    await client.trackFailure({
      experimentId: 'exp-conv',
      userId: 'user-conv'
    });
    
    // Test trackFeedback
    await client.trackFeedback('negative', {
      experimentId: 'exp-conv',
      userId: 'user-conv',
      score: 3.0
    });
    
    const requests = mockServer.getRequests();
    const eventRequests = requests.filter(r => r.path === '/api/v1/events');
    assertEqual(eventRequests.length, 2);
    assertEqual(eventRequests[0].data.outcome, 'failure');
    assertEqual(eventRequests[1].data.outcome, 'success');
    assertEqual(eventRequests[1].data.user_feedback, 'negative');
    
    client.destroy();
    mockServer.clear();
  });

  // Test 15: Cache TTL and cleanup
  await asyncTest('Cache TTL and cleanup', async () => {
    // Create a client with very short TTL for testing
    const client = new LaikaTestClient('test-api-key', {
      baseUrl: 'http://localhost:3001',
      timeout: 1000,
      cacheTtl: 100 // 100ms for testing
    });

    // Override the _makeRequest method to use mock server
    client._makeRequest = async function(method, path, data) {
      mockServer.recordRequest(path, method, data);
      
      const mockResponse = mockServer.getResponse(path, method);
      if (!mockResponse) {
        throw new NetworkError(`No mock response for ${method} ${path}`);
      }

      if (mockResponse.failure) {
        throw new NetworkError('Mock network failure');
      }

      if (mockResponse.statusCode >= 400) {
        throw new LaikaServiceError(
          mockResponse.response.error || 'Mock error',
          mockResponse.statusCode,
          mockResponse.response
        );
      }

      return mockResponse.response;
    };
    
    const mockAssignment = {
      success: true,
      data: { assignment_id: 'ttl-123' }
    };
    mockServer.setResponse('/api/v1/experiments/exp-ttl/prompt', 'POST', mockAssignment);
    
    // Get assignment
    await client.getPromptForUser('exp-ttl', 'user-ttl');
    
    // Verify it's cached
    const cached = client.assignmentCache.get('exp-ttl', 'user-ttl', null);
    assert(cached !== null);
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should be expired now
    const expired = client.assignmentCache.get('exp-ttl', 'user-ttl', null);
    assert(expired === null);
    
    client.destroy();
    mockServer.clear();
  });

  // Test 16: Get experiment events - basic functionality
  await asyncTest('Get experiment events - basic', async () => {
    const client = createTestClient(mockServer);
    
    const mockEventsResponse = {
      success: true,
      data: [
        {
          id: 'event-1',
          experiment_id: 'exp-events',
          outcome: 'success',
          score: 8.5,
          created_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 'event-2',
          experiment_id: 'exp-events',
          outcome: 'failure',
          score: 3.2,
          created_at: '2024-01-15T11:00:00Z'
        }
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 50
      }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-events/events', 'GET', mockEventsResponse);
    
    const result = await client.getExperimentEvents('exp-events');
    
    assert(Array.isArray(result.events));
    assertEqual(result.events.length, 2);
    assertEqual(result.meta.total, 2);
    assertEqual(result.events[0].id, 'event-1');
    assertEqual(result.events[0].outcome, 'success');
    
    client.destroy();
    mockServer.clear();
  });

  // Test 17: Get experiment events with filters
  await asyncTest('Get experiment events with filters', async () => {
    const client = createTestClient(mockServer);
    
    const mockEventsResponse = {
      success: true,
      data: [],
      meta: { total: 0, page: 1, limit: 25 }
    };
    
    mockServer.setResponse('/api/v1/experiments/exp-filters/events', 'GET', mockEventsResponse);
    
    const filters = {
      startDate: '2024-01-15T00:00:00Z',
      endDate: '2024-01-16T00:00:00Z',
      userId: 'user-123',
      outcome: 'success',
      minScore: 5.0,
      page: 1,
      limit: 25
    };
    
    await client.getExperimentEvents('exp-filters', filters);
    
    const requests = mockServer.getRequests();
    const eventsRequest = requests[0];
    
    assertEqual(eventsRequest.method, 'GET');
    assert(eventsRequest.path.includes('/experiments/exp-filters/events'));
    assert(eventsRequest.path.includes('start_date=2024-01-15T00%3A00%3A00Z'));
    assert(eventsRequest.path.includes('user_id=user-123'));
    assert(eventsRequest.path.includes('outcome=success'));
    assert(eventsRequest.path.includes('min_score=5'));
    assert(eventsRequest.path.includes('page=1'));
    assert(eventsRequest.path.includes('limit=25'));
    
    client.destroy();
    mockServer.clear();
  });

  // Test 18: Get experiment events - validation errors
  await asyncTest('Get experiment events validation', async () => {
    const client = createTestClient(mockServer);
    
    // Test missing experiment ID
    try {
      await client.getExperimentEvents('');
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('experimentId is required'));
    }
    
    // Test invalid page number
    try {
      await client.getExperimentEvents('exp-123', { page: 0 });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('page must be a positive number'));
    }
    
    // Test invalid limit
    try {
      await client.getExperimentEvents('exp-123', { limit: 1000 });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('limit must be a number between 1 and 500'));
    }
    
    // Test invalid date format
    try {
      await client.getExperimentEvents('exp-123', { startDate: 'invalid-date' });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('ISO 8601 format'));
    }
    
    // Test invalid score range
    try {
      await client.getExperimentEvents('exp-123', { minScore: 15 });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('minScore must be a number between 0 and 10'));
    }
    
    // Test invalid outcome
    try {
      await client.getExperimentEvents('exp-123', { outcome: 'invalid' });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('outcome must be "success" or "failure"'));
    }
    
    client.destroy();
    mockServer.clear();
  });

  // Test 19: Get experiment events - date range validation
  await asyncTest('Get experiment events date range validation', async () => {
    const client = createTestClient(mockServer);
    
    // Test start date after end date
    try {
      await client.getExperimentEvents('exp-123', {
        startDate: '2024-01-16T00:00:00Z',
        endDate: '2024-01-15T00:00:00Z'
      });
      assert(false, 'Should have thrown validation error');
    } catch (error) {
      assert(error instanceof ValidationError);
      assert(error.message.includes('startDate must be before endDate'));
    }
    
    client.destroy();
    mockServer.clear();
  });

  // Test 20: Get experiment events - service error handling
  await asyncTest('Get experiment events error handling', async () => {
    const client = createTestClient(mockServer);
    
    // Test service error
    mockServer.setResponse('/api/v1/experiments/exp-error/events', 'GET', {
      success: false,
      error: 'Experiment not found'
    }, 404);
    
    try {
      await client.getExperimentEvents('exp-error');
      assert(false, 'Should have thrown service error');
    } catch (error) {
      assert(error instanceof LaikaServiceError);
      assertEqual(error.statusCode, 404);
    }
    
    // Test network error
    mockServer.setFailure('/api/v1/experiments/exp-network/events', 'GET');
    
    try {
      await client.getExperimentEvents('exp-network');
      assert(false, 'Should have thrown network error');
    } catch (error) {
      assert(error instanceof NetworkError);
    }
    
    client.destroy();
    mockServer.clear();
  });

  // Print test results
  console.log(`\n📊 Test Results: ${passCount}/${testCount} tests passed`);
  
  if (passCount === testCount) {
    console.log('🎉 All tests passed!');
  } else {
    console.log(`❌ ${testCount - passCount} tests failed`);
    process.exit(1);
  }
}

// Export for external use
module.exports = {
  runTests,
  MockServer,
  createTestClient
};

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}