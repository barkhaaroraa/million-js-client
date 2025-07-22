# Prompt Test Client

A Node.js client library for the LLM Prompt A/B Testing Platform with automatic context binding and intelligent caching.

## Features

- **Automatic Assignment Tracking**: No need to manually manage assignment IDs
- **Smart Caching**: Assignments cached with TTL for consistency
- **Three Assignment Types**: User-based, session-based, and random
- **Custom Error Classes**: Detailed error handling for different failure scenarios
- **Zero Dependencies**: Pure Node.js implementation
- **TypeScript-Ready**: Clear interfaces and error types

## Installation

```bash
npm install prompt-test-client
```

## Quick Start

```javascript
const { PromptTestClient } = require('prompt-test-client');

// Initialize client
const client = new PromptTestClient('your-api-key');

// Get prompt and track outcome
async function example() {
  // Get assigned prompt (cached automatically)
  const assignment = await client.getPromptForUser('experiment_id', 'user_123');
  
  // Use the prompt
  console.log('Prompt:', assignment.prompt_content);
  console.log('Variant:', assignment.variant_name);
  
  // Track success (assignment ID resolved automatically)
  await client.trackSuccess({
    experimentId: 'experiment_id',
    userId: 'user_123',
    score: 8.5,
    userFeedback: 'positive'
  });
}
```

## API Reference

### Constructor

```javascript
const client = new PromptTestClient(apiKey, options)
```

**Parameters:**
- `apiKey` (string, required): Your API key
- `options` (object, optional):
  - `baseUrl` (string): API base URL (default: 'https://api.prompttester.com')
  - `timeout` (number): Request timeout in ms (default: 10000)
  - `cacheTtl` (number): Cache TTL in ms (default: 30 minutes)

### Prompt Assignment Methods

#### User-Based Assignment
```javascript
const assignment = await client.getPromptForUser(experimentId, userId)
```

#### Session-Based Assignment
```javascript
const assignment = await client.getPromptForSession(experimentId, sessionId)
```

#### Random Assignment
```javascript
const assignment = await client.getRandomPrompt(experimentId)
```

**Returns:** Assignment object with:
- `prompt_content`: The prompt text to use
- `variant_name`: Name of the assigned variant
- `assignment_id`: Unique assignment identifier
- `prompt_metadata`: Template and version information
- `experiment_metadata`: Experiment details

### Event Tracking Methods

#### Track Outcome
```javascript
await client.trackOutcome(outcome, options)
```

**Parameters:**
- `outcome` (string): 'success' or 'failure'
- `options` (object):
  - `experimentId` (string): Required for automatic resolution
  - `userId` (string): Required for user-based experiments
  - `sessionId` (string): Required for session-based experiments
  - `assignmentId` (string): Optional, for explicit tracking
  - `score` (number): Quality score 0-10
  - `userFeedback` (string): 'positive', 'negative', or 'neutral'

#### Get Experiment Events
```javascript
const { events, meta } = await client.getExperimentEvents(experimentId, filters)
```

**Parameters:**
- `experimentId` (string, required): Experiment ID to get events for
- `filters` (object, optional):
  - `startDate` (string): ISO 8601 date string (e.g., '2024-01-15T00:00:00Z')
  - `endDate` (string): ISO 8601 date string
  - `userId` (string): Filter events for specific user
  - `sessionId` (string): Filter events for specific session
  - `minScore` (number): Minimum score threshold (0-10)
  - `maxScore` (number): Maximum score threshold (0-10)
  - `feedback` (string): Text search in feedback field
  - `outcome` (string): 'success' or 'failure'
  - `page` (number): Page number (default: 1)
  - `limit` (number): Results per page (1-500, default: 50)

**Returns:** Object with:
- `events`: Array of event objects
- `meta`: Pagination metadata (total, page, limit)

#### Convenience Methods
```javascript
// Track success
await client.trackSuccess({
  experimentId: 'exp_123',
  userId: 'user_456',
  score: 8.5
});

// Track failure
await client.trackFailure({
  experimentId: 'exp_123',
  sessionId: 'session_789'
});

// Track with feedback
await client.trackFeedback('positive', {
  experimentId: 'exp_123',
  userId: 'user_456',
  score: 9.0
});
```

## Error Handling

The library provides specific error classes for different scenarios:

```javascript
const { 
  PromptServiceError,
  NetworkError,
  ValidationError,
  AssignmentNotFoundError 
} = require('prompt-test-client');

try {
  const assignment = await client.getPromptForUser('exp_123', 'user_456');
  // Use prompt...
  await client.trackSuccess({ experimentId: 'exp_123', userId: 'user_456' });
  
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof AssignmentNotFoundError) {
    console.error('No cached assignment found:', error.message);
  } else if (error instanceof PromptServiceError) {
    console.error('Service error:', error.message, 'Status:', error.statusCode);
    // Implement your fallback logic here
    const fallbackPrompt = "You are a helpful assistant.";
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    // Implement retry logic or use cached data
  }
}
```

## Fallback Strategy

The library throws errors when the service is unavailable, allowing you to implement your own fallback strategy:

```javascript
async function getPromptWithFallback(experimentId, userId) {
  try {
    return await client.getPromptForUser(experimentId, userId);
  } catch (error) {
    if (error instanceof PromptServiceError || error instanceof NetworkError) {
      // Service unavailable - use your fallback
      return {
        prompt_content: "You are a helpful assistant.",
        variant_name: "fallback",
        assignment_id: null,
        is_fallback: true
      };
    }
    throw error; // Re-throw validation errors
  }
}
```

## Caching Behavior

- **User/Session assignments**: Cached for 30 minutes (configurable)
- **Random assignments**: Not cached (new assignment each call)
- **Automatic cleanup**: Expired entries cleaned every 5 minutes
- **Memory efficient**: Only stores assignment metadata

## Best Practices

1. **Initialize once**: Create one client instance and reuse it
2. **Handle errors gracefully**: Always implement fallback strategies
3. **Use appropriate assignment types**: 
   - User-based for personalized experiences
   - Session-based for temporary interactions
   - Random for true randomization
4. **Track consistently**: Always track outcomes for valid experiments
5. **Clean up resources**: Call `client.destroy()` when shutting down

## Advanced Usage

### Multiple Experiments
```javascript
// Handle multiple experiments for the same user
const chatAssignment = await client.getPromptForUser('chat_exp', 'user_123');
const emailAssignment = await client.getPromptForUser('email_exp', 'user_123');

// Track each experiment separately
await client.trackSuccess({ experimentId: 'chat_exp', userId: 'user_123' });
await client.trackSuccess({ experimentId: 'email_exp', userId: 'user_123' });
```

### Explicit Assignment IDs
```javascript
// For complex scenarios, use explicit assignment IDs
const assignment = await client.getRandomPrompt('exp_123');
await client.trackOutcome('success', {
  assignmentId: assignment.assignment_id,
  experimentId: 'exp_123',
  score: 7.5
});
```

### Events Analysis
```javascript
// Get all events for an experiment
const { events, meta } = await client.getExperimentEvents('experiment_123');
console.log(`Found ${meta.total} events`);

// Filter events by date range and outcome
const recentSuccesses = await client.getExperimentEvents('experiment_123', {
  startDate: '2024-01-15T00:00:00Z',
  endDate: '2024-01-22T23:59:59Z',
  outcome: 'success',
  minScore: 7.0
});

// Get events for specific user with pagination
const userEvents = await client.getExperimentEvents('experiment_123', {
  userId: 'user_456',
  page: 2,
  limit: 25
});

// Search feedback containing specific text
const feedbackEvents = await client.getExperimentEvents('experiment_123', {
  feedback: 'excellent',
  outcome: 'success'
});
```

### Cache Management
```javascript
// Clear cache manually
client.clearCache();

// Cleanup resources on shutdown
process.on('SIGTERM', () => {
  client.destroy();
});
```

## License

MIT