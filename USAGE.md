# LaikaTest - Usage Guide for Backend Engineers

A zero-dependency Node.js client library for A/B testing prompts and tracking experiment outcomes.

## Quick Start

### Installation

```bash
npm install laika-test
```

### Basic Setup

```javascript
const { LaikaTestClient } = require('laika-test');

const client = new LaikaTestClient('your-api-key', {
  baseUrl: 'https://api.laikatest.com', // optional
  timeout: 10000, // 10 seconds, optional
  cacheTtl: 30 * 60 * 1000 // 30 minutes, optional
});
```

## Core Concepts

### Assignment Types

LaikaTest supports three assignment strategies:

1. **User-based**: Consistent assignment per user ID
2. **Session-based**: Consistent assignment per session ID  
3. **Random**: New assignment on every request

### Automatic Caching

- User and session assignments are automatically cached for 30 minutes
- Random assignments are never cached
- Cache prevents inconsistent experiences within the TTL window

## Usage Patterns

### 1. User-Based Experiments

Use when you want consistent prompt variants per user across sessions:

```javascript
async function handleUserRequest(userId) {
  try {
    // Get prompt assignment for user
    const assignment = await client.getPromptForUser('experiment-123', userId);
    
    // Use the prompt content in your application
    const result = await processWithLLM(assignment.prompt_content);
    
    // Track success/failure
    if (result.success) {
      await client.trackSuccess({
        experimentId: 'experiment-123',
        userId: userId,
        score: 8.5 // optional quality score 0-10
      });
    } else {
      await client.trackFailure({
        experimentId: 'experiment-123',
        userId: userId
      });
    }
    
    return result;
  } catch (error) {
    // Handle fallback
    console.error('Experiment failed:', error);
    return await processWithLLM(FALLBACK_PROMPT);
  }
}
```

### 2. Session-Based Experiments

Use for anonymous users or when session consistency is more important:

```javascript
async function handleSessionRequest(sessionId) {
  try {
    const assignment = await client.getPromptForSession('experiment-456', sessionId);
    
    const result = await processRequest(assignment.prompt_content);
    
    // Track with user feedback
    await client.trackFeedback('positive', {
      experimentId: 'experiment-456',
      sessionId: sessionId
    });
    
    return result;
  } catch (error) {
    return await processRequest(DEFAULT_PROMPT);
  }
}
```

### 3. Random Experiments

Use for one-off experiments or when you don't need consistency:

```javascript
async function handleRandomRequest() {
  try {
    // Each call gets a fresh random assignment
    const assignment = await client.getRandomPrompt('experiment-789');
    
    const result = await generateContent(assignment.prompt_content);
    
    // For random assignments, you must provide the assignment ID explicitly
    await client.trackOutcome('success', {
      experimentId: 'experiment-789',
      assignmentId: assignment.assignment_id,
      score: 7.2
    });
    
    return result;
  } catch (error) {
    return await generateContent(BACKUP_PROMPT);
  }
}
```

## Error Handling

LaikaTest provides specific error types for different failure scenarios:

```javascript
const { 
  LaikaTestClient,
  LaikaServiceError,
  NetworkError,
  ValidationError,
  AssignmentNotFoundError 
} = require('laika-test');

async function robustExperimentHandler(userId) {
  try {
    const assignment = await client.getPromptForUser('exp-1', userId);
    return await processPrompt(assignment.prompt_content);
  } catch (error) {
    if (error instanceof NetworkError) {
      // Network issues - retry or use cached fallback
      console.warn('Network error, using fallback:', error.message);
      return await processPrompt(CACHED_FALLBACK);
    } else if (error instanceof LaikaServiceError) {
      // API errors - log and fallback
      console.error('Service error:', error.statusCode, error.message);
      return await processPrompt(DEFAULT_PROMPT);
    } else if (error instanceof ValidationError) {
      // Developer error - fix the code
      console.error('Validation error:', error.message);
      throw error;
    } else {
      // Unknown error
      console.error('Unexpected error:', error);
      return await processPrompt(SAFE_FALLBACK);
    }
  }
}
```

## Express.js Integration

### Middleware Pattern

```javascript
const express = require('express');
const { LaikaTestClient } = require('laika-test');

const app = express();
const experimentClient = new LaikaTestClient(process.env.LAIKA_API_KEY);

// Middleware to add experiment assignment to request
app.use(async (req, res, next) => {
  if (req.user?.id) {
    try {
      req.promptAssignment = await experimentClient.getPromptForUser(
        'welcome-message-exp', 
        req.user.id
      );
    } catch (error) {
      console.warn('Experiment assignment failed:', error.message);
      req.promptAssignment = null;
    }
  }
  next();
});

// Route handler
app.get('/api/welcome', async (req, res) => {
  const prompt = req.promptAssignment?.prompt_content || DEFAULT_WELCOME_PROMPT;
  
  try {
    const message = await generateWelcomeMessage(prompt, req.user);
    
    // Track success
    if (req.promptAssignment) {
      await experimentClient.trackSuccess({
        experimentId: 'welcome-message-exp',
        userId: req.user.id
      });
    }
    
    res.json({ message });
  } catch (error) {
    // Track failure
    if (req.promptAssignment) {
      await experimentClient.trackFailure({
        experimentId: 'welcome-message-exp',
        userId: req.user.id
      });
    }
    
    res.status(500).json({ error: 'Failed to generate message' });
  }
});
```

### Cleanup on Server Shutdown

```javascript
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  experimentClient.destroy(); // Clean up background processes
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

## Background Jobs/Workers

For background processing, ensure proper cleanup:

```javascript
const { Worker } = require('worker_threads');

class ExperimentWorker {
  constructor() {
    this.client = new LaikaTestClient(process.env.LAIKA_API_KEY);
  }
  
  async processJob(job) {
    try {
      const assignment = await this.client.getPromptForUser(
        job.experimentId, 
        job.userId
      );
      
      const result = await processWithPrompt(assignment.prompt_content, job.data);
      
      await this.client.trackOutcome(result.success ? 'success' : 'failure', {
        experimentId: job.experimentId,
        userId: job.userId,
        score: result.qualityScore
      });
      
      return result;
    } catch (error) {
      console.error('Job processing failed:', error);
      throw error;
    }
  }
  
  shutdown() {
    this.client.destroy();
  }
}

const worker = new ExperimentWorker();

// Handle worker shutdown
process.on('SIGTERM', () => {
  worker.shutdown();
  process.exit(0);
});
```

## Performance Tips

### 1. Reuse Client Instances

```javascript
// ✅ Good - Single client instance
const globalClient = new LaikaTestClient(API_KEY);

// ❌ Bad - New client per request
app.get('/api/data', async (req, res) => {
  const client = new LaikaTestClient(API_KEY); // Don't do this
});
```

### 2. Batch Operations

```javascript
// Process multiple experiments efficiently
async function handleMultipleExperiments(userId) {
  const [promptExp, formatExp] = await Promise.all([
    client.getPromptForUser('prompt-exp', userId),
    client.getPromptForUser('format-exp', userId)
  ]);
  
  const result = await processContent(promptExp.prompt_content, formatExp.prompt_content);
  
  // Track outcomes in parallel
  await Promise.all([
    client.trackSuccess({ experimentId: 'prompt-exp', userId }),
    client.trackSuccess({ experimentId: 'format-exp', userId })
  ]);
  
  return result;
}
```

### 3. Cache Warming

```javascript
// Pre-populate cache for known users
async function warmCache(userIds, experimentId) {
  const promises = userIds.map(userId => 
    client.getPromptForUser(experimentId, userId).catch(err => {
      console.warn(`Failed to warm cache for user ${userId}:`, err.message);
    })
  );
  
  await Promise.allSettled(promises);
}
```

## Configuration

### Environment Variables

```bash
# .env file
LAIKA_API_KEY=your-api-key-here
LAIKA_BASE_URL=https://api.laikatest.com
LAIKA_TIMEOUT=10000
LAIKA_CACHE_TTL=1800000
```

```javascript
const client = new LaikaTestClient(process.env.LAIKA_API_KEY, {
  baseUrl: process.env.LAIKA_BASE_URL,
  timeout: parseInt(process.env.LAIKA_TIMEOUT),
  cacheTtl: parseInt(process.env.LAIKA_CACHE_TTL)
});
```

### Production Configuration

```javascript
const isProd = process.env.NODE_ENV === 'production';

const client = new LaikaTestClient(process.env.LAIKA_API_KEY, {
  baseUrl: isProd ? 'https://api.laikatest.com' : 'http://localhost:3001',
  timeout: isProd ? 15000 : 5000,
  cacheTtl: isProd ? 30 * 60 * 1000 : 5 * 60 * 1000 // Shorter TTL in dev
});
```

## Events API for Analytics

### Getting Experiment Events

Use the events API to analyze experiment performance and debugging:

```javascript
// Get all events for analysis
async function analyzeExperiment(experimentId) {
  try {
    // Get events from the last week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { events, meta } = await client.getExperimentEvents(experimentId, {
      startDate: oneWeekAgo.toISOString(),
      endDate: new Date().toISOString(),
      limit: 100
    });
    
    console.log(`Analyzed ${meta.total} events from ${events.length} shown`);
    
    // Calculate success rate
    const successfulEvents = events.filter(e => e.outcome === 'success');
    const successRate = (successfulEvents.length / events.length) * 100;
    
    console.log(`Success rate: ${successRate.toFixed(2)}%`);
    
    return { events, successRate };
  } catch (error) {
    console.error('Failed to analyze experiment:', error);
    throw error;
  }
}
```

### Filtering Events by User/Session

```javascript
// Debug specific user's experience
async function debugUserExperience(experimentId, userId) {
  const { events } = await client.getExperimentEvents(experimentId, {
    userId: userId,
    limit: 50
  });
  
  console.log(`User ${userId} has ${events.length} events:`);
  events.forEach(event => {
    console.log(`- ${event.created_at}: ${event.outcome} (score: ${event.score})`);
    if (event.feedback) {
      console.log(`  Feedback: ${event.feedback}`);
    }
  });
}

// Analyze session-based patterns
async function analyzeSessionBehavior(experimentId) {
  const { events } = await client.getExperimentEvents(experimentId, {
    outcome: 'failure',
    limit: 200
  });
  
  // Group by session
  const sessionGroups = events.reduce((acc, event) => {
    if (!event.session_id) return acc;
    
    if (!acc[event.session_id]) {
      acc[event.session_id] = [];
    }
    acc[event.session_id].push(event);
    return acc;
  }, {});
  
  console.log('Sessions with failures:', Object.keys(sessionGroups).length);
  return sessionGroups;
}
```

### Quality Score Analysis

```javascript
// Find low-scoring events for improvement
async function findLowQualityEvents(experimentId) {
  const { events } = await client.getExperimentEvents(experimentId, {
    maxScore: 5.0, // Events with score <= 5.0
    outcome: 'success', // Even successful events with low scores
    limit: 50
  });
  
  const insights = events.map(event => ({
    score: event.score,
    feedback: event.feedback,
    userId: event.user_id,
    timestamp: event.created_at
  }));
  
  console.log('Low quality events found:', insights.length);
  return insights;
}

// Track score trends over time
async function analyzeScoreTrends(experimentId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { events } = await client.getExperimentEvents(experimentId, {
    startDate: startDate.toISOString(),
    minScore: 0, // Include all scored events
    limit: 500
  });
  
  // Group by day and calculate average scores
  const dailyScores = events
    .filter(e => e.score !== null)
    .reduce((acc, event) => {
      const day = event.created_at.split('T')[0];
      if (!acc[day]) {
        acc[day] = { scores: [], count: 0 };
      }
      acc[day].scores.push(event.score);
      acc[day].count++;
      return acc;
    }, {});
  
  // Calculate daily averages
  const trends = Object.entries(dailyScores).map(([day, data]) => ({
    day,
    averageScore: data.scores.reduce((a, b) => a + b) / data.scores.length,
    eventCount: data.count
  }));
  
  return trends.sort((a, b) => a.day.localeCompare(b.day));
}
```

### Pagination for Large Datasets

```javascript
// Process all events with pagination
async function processAllEvents(experimentId, processor) {
  let page = 1;
  let hasMore = true;
  const limit = 100;
  
  while (hasMore) {
    try {
      const { events, meta } = await client.getExperimentEvents(experimentId, {
        page,
        limit
      });
      
      // Process this batch of events
      await processor(events);
      
      // Check if there are more pages
      hasMore = events.length === limit && (page * limit) < meta.total;
      page++;
      
      console.log(`Processed page ${page - 1}, ${events.length} events`);
      
      // Add delay to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Error processing page ${page}:`, error);
      break;
    }
  }
}

// Example usage
await processAllEvents('experiment-123', async (events) => {
  // Process each batch of events
  for (const event of events) {
    await updateAnalytics(event);
  }
});
```

### Real-time Monitoring

```javascript
// Check for recent issues
async function monitorRecentActivity(experimentId, minutesBack = 30) {
  const startTime = new Date();
  startTime.setMinutes(startTime.getMinutes() - minutesBack);
  
  const { events, meta } = await client.getExperimentEvents(experimentId, {
    startDate: startTime.toISOString(),
    limit: 200
  });
  
  const failures = events.filter(e => e.outcome === 'failure');
  const lowScores = events.filter(e => e.score && e.score < 4.0);
  
  if (failures.length > events.length * 0.5) {
    console.warn(`High failure rate: ${failures.length}/${events.length} events failed`);
  }
  
  if (lowScores.length > events.length * 0.3) {
    console.warn(`Many low scores: ${lowScores.length}/${events.length} events scored < 4.0`);
  }
  
  return {
    totalEvents: events.length,
    failures: failures.length,
    lowScores: lowScores.length,
    healthStatus: failures.length < events.length * 0.2 ? 'healthy' : 'concerning'
  };
}
```

## Testing

### Unit Tests

```javascript
const { LaikaTestClient } = require('laika-test');

describe('Experiment Integration', () => {
  let client;
  
  beforeEach(() => {
    client = new LaikaTestClient('test-key', {
      baseUrl: 'http://localhost:3001'
    });
  });
  
  afterEach(() => {
    client.destroy();
  });
  
  it('should handle experiment assignment', async () => {
    const assignment = await client.getPromptForUser('test-exp', 'user-123');
    expect(assignment.prompt_content).toBeDefined();
    expect(assignment.assignment_id).toBeDefined();
  });
  
  it('should fetch experiment events', async () => {
    const { events, meta } = await client.getExperimentEvents('test-exp');
    expect(Array.isArray(events)).toBe(true);
    expect(meta).toHaveProperty('total');
    expect(meta).toHaveProperty('page');
    expect(meta).toHaveProperty('limit');
  });
});
```

### Integration Tests

```javascript
// Mock the client for integration tests
jest.mock('laika-test', () => ({
  LaikaTestClient: jest.fn().mockImplementation(() => ({
    getPromptForUser: jest.fn().mockResolvedValue({
      prompt_content: 'Test prompt',
      assignment_id: 'test-assignment-id',
      variant_name: 'variant_a'
    }),
    trackSuccess: jest.fn().mockResolvedValue({ id: 'event-123' }),
    destroy: jest.fn()
  }))
}));
```

## Best Practices

1. **Always handle errors gracefully** - Experiments should never break your core functionality
2. **Use fallback prompts** - Have default prompts ready when experiments fail
3. **Track both success and failure** - This helps measure experiment impact
4. **Clean up resources** - Call `client.destroy()` on shutdown
5. **Monitor cache hit rates** - Ensure assignments are being cached effectively
6. **Use appropriate assignment types** - User-based for personalization, session-based for anonymous users
7. **Validate experiment IDs** - Use constants or enums to avoid typos

## Troubleshooting

### Common Issues

**Assignment Not Found Error**
```javascript
// Make sure to call getPrompt* before tracking
const assignment = await client.getPromptForUser('exp-1', 'user-123');
// Now tracking will work
await client.trackSuccess({ experimentId: 'exp-1', userId: 'user-123' });
```

**Network Timeouts**
```javascript
// Increase timeout for slow networks
const client = new LaikaTestClient(apiKey, { timeout: 30000 });
```

**Memory Leaks**
```javascript
// Always clean up
process.on('exit', () => client.destroy());
```