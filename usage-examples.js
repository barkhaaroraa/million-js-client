// usage-examples.js

const {
    LaikaTestClient,
    LaikaServiceError,
    NetworkError,
    ValidationError,
    AssignmentNotFoundError
} = require('./laika-test-client');

// Initialize client
const client = new LaikaTestClient('be17d320e9dee9dc49785686abe83b476860569a25dbcd888269a244db473603', {
    baseUrl: 'http://localhost:3001', // optional, this is default
    timeout: 10000, // optional, 10 seconds default
    cacheTtl: 30 * 60 * 1000 // optional, 30 minutes default
});

// Example 1: Basic user-based assignment and tracking
async function example1() {
    try {
        console.log('Example 1: User-based assignment');

        // Get prompt for user
        const assignment = await client.getPromptForUser('47ae87b0-a896-452e-b5a5-f176f6427e58', 'user_456');
        console.log('Prompt received:', assignment.prompt_content);
        console.log('Variant:', assignment.variant_name);

        // Simulate using the prompt and getting a result
        const wasSuccessful = true; // Your business logic here
        const qualityScore = 8.5;

        // Track outcome (automatic assignment ID resolution)
        await client.trackSuccess({
            experimentId: '47ae87b0-a896-452e-b5a5-f176f6427e58',
            userId: 'user_456',
            score: qualityScore,
            userFeedback: 'positive'
        });

        console.log('✅ Success tracked');

    } catch (error) {
        handleError(error);
    }
}

// Example 2: Session-based assignment
async function example2() {
    try {
        console.log('\nExample 2: Session-based assignment');

        const assignment = await client.getPromptForSession('47ae87b0-a896-452e-b5a5-f176f6427e58', 'session_abc');
        console.log('Prompt received:', assignment.prompt_content);

        // Track failure
        await client.trackFailure({
            experimentId: '47ae87b0-a896-452e-b5a5-f176f6427e58',
            sessionId: 'session_abc'
        });

        console.log('❌ Failure tracked');

    } catch (error) {
        handleError(error);
    }
}

// Example 3: Random assignment (no caching)
async function example3() {
    try {
        console.log('\nExample 3: Random assignment');

        const assignment = await client.getRandomPrompt('47ae87b0-a896-452e-b5a5-f176f6427e58');
        console.log('Random prompt received:', assignment.prompt_content);

        // For random assignments, you need to provide assignment ID explicitly
        await client.trackSuccess({
            assignmentId: assignment.assignment_id,
            experimentId: '47ae87b0-a896-452e-b5a5-f176f6427e58',
            score: 7.2
        });

        console.log('✅ Random assignment tracked');

    } catch (error) {
        handleError(error);
    }
}

// Example 4: Error handling with fallbacks
async function example4() {
    try {
        console.log('\nExample 4: Error handling with fallbacks');

        const assignment = await client.getPromptForUser('47ae87b0-a896-452e-b5a5-f176f6427e58', 'user_999');
        console.log('Prompt received:', assignment.prompt_content);

    } catch (error) {
        if (error instanceof LaikaServiceError) {
            console.log('Service error, using fallback prompt');
            // Your fallback logic here
            const fallbackPrompt = "You are a helpful assistant.";
            console.log('Using fallback:', fallbackPrompt);

            // You might choose not to track fallback usage, or track it differently

        } else if (error instanceof NetworkError) {
            console.log('Network error, retrying or using cached data');
            // Your retry/offline logic here

        } else {
            console.log('Unexpected error:', error.message);
        }
    }
}

// Example 5: Batch user interactions
async function example5() {
    try {
        console.log('\nExample 5: Multiple users in sequence');

        const users = ['user_1', 'user_2', 'user_3'];

        for (const userId of users) {
            // Get prompt (will be cached automatically)
            const assignment = await client.getPromptForUser('47ae87b0-a896-452e-b5a5-f176f6427e58', userId);
            console.log(`User ${userId} got variant: ${assignment.variant_name}`);

            // Simulate some processing time
            await new Promise(resolve => setTimeout(resolve, 100));

            // Track outcome (uses cached assignment automatically)
            const randomOutcome = Math.random() > 0.5 ? 'success' : 'failure';
            await client.trackOutcome(randomOutcome, {
                experimentId: '47ae87b0-a896-452e-b5a5-f176f6427e58',
                userId: userId,
                score: Math.random() * 10
            });

            console.log(`✅ ${randomOutcome} tracked for ${userId}`);
        }

    } catch (error) {
        handleError(error);
    }
}

// Example 6: Advanced tracking with all options
async function example6() {
    try {
        console.log('\nExample 6: Advanced tracking');

        const assignment = await client.getPromptForUser('47ae87b0-a896-452e-b5a5-f176f6427e58', 'power_user');

        // Use the prompt in your application
        console.log('Using prompt:', assignment.prompt_content);

        // Track with all available options
        await client.trackOutcome('success', {
            experimentId: '47ae87b0-a896-452e-b5a5-f176f6427e58',
            userId: 'power_user',
            score: 9.1,
            userFeedback: 'positive'
        });

        console.log('✅ Advanced tracking completed');

    } catch (error) {
        handleError(error);
    }
}

// Example 7: Get experiment events for analysis
async function example7() {
    try {
        console.log('\nExample 7: Experiment events analysis');
        
        // Get all events for an experiment
        const { events, meta } = await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58');
        console.log(`Found ${meta.total} total events, showing ${events.length}`);
        
        // Calculate success rate
        const successfulEvents = events.filter(e => e.outcome === 'success');
        const successRate = events.length > 0 ? (successfulEvents.length / events.length) * 100 : 0;
        console.log(`Success rate: ${successRate.toFixed(1)}%`);

    } catch (error) {
        handleError(error);
    }
}

// Example 8: Filter events by date range and outcome
async function example8() {
    try {
        console.log('\nExample 8: Filtered events analysis');
        
        // Get events from the last 7 days with success outcomes and good scores
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const { events, meta } = await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
            startDate: oneWeekAgo.toISOString(),
            endDate: new Date().toISOString(),
            outcome: 'success',
            minScore: 7.0,
            limit: 10
        });
        
        console.log(`High-quality success events in last week: ${meta.total} total, showing ${events.length}`);
        
        events.forEach(event => {
            console.log(`- Score: ${event.score}, User: ${event.user_id || 'N/A'}, Time: ${event.created_at}`);
            if (event.feedback) {
                console.log(`  Feedback: ${event.feedback}`);
            }
        });

    } catch (error) {
        handleError(error);
    }
}

// Example 9: Debug user experience with events
async function example9() {
    try {
        console.log('\nExample 9: User experience debugging');
        
        // Get all events for a specific user
        const { events } = await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
            userId: 'user_456',
            limit: 20
        });
        
        console.log(`User 'user_456' has ${events.length} events:`);
        
        // Show user's journey
        events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        events.forEach((event, index) => {
            const timestamp = new Date(event.created_at).toLocaleString();
            console.log(`${index + 1}. ${timestamp}: ${event.outcome} (score: ${event.score || 'N/A'})`);
            if (event.feedback) {
                console.log(`   Feedback: "${event.feedback}"`);
            }
        });

    } catch (error) {
        handleError(error);
    }
}

// Example 10: Paginate through large datasets
async function example10() {
    try {
        console.log('\nExample 10: Paginated events processing');
        
        let page = 1;
        let hasMore = true;
        let totalProcessed = 0;
        const limit = 25;
        
        while (hasMore && page <= 3) { // Limit to 3 pages for demo
            const { events, meta } = await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
                page,
                limit
            });
            
            console.log(`Page ${page}: Processing ${events.length} events`);
            
            // Process events (example: count outcomes)
            const outcomes = events.reduce((acc, event) => {
                acc[event.outcome] = (acc[event.outcome] || 0) + 1;
                return acc;
            }, {});
            
            console.log(`  Outcomes: ${JSON.stringify(outcomes)}`);
            
            totalProcessed += events.length;
            hasMore = events.length === limit && (page * limit) < meta.total;
            page++;
        }
        
        console.log(`Processed ${totalProcessed} events across ${page - 1} pages`);

    } catch (error) {
        handleError(error);
    }
}

// Example 11: Real-time monitoring
async function example11() {
    try {
        console.log('\nExample 11: Real-time experiment monitoring');
        
        // Check events from the last 30 minutes
        const thirtyMinutesAgo = new Date();
        thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);
        
        const { events, meta } = await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
            startDate: thirtyMinutesAgo.toISOString(),
            limit: 100
        });
        
        console.log(`Recent activity (last 30 min): ${events.length} events`);
        
        // Calculate key metrics
        const failures = events.filter(e => e.outcome === 'failure');
        const lowScores = events.filter(e => e.score && e.score < 4.0);
        const avgScore = events
            .filter(e => e.score !== null)
            .reduce((sum, e, _, arr) => sum + e.score / arr.length, 0);
        
        console.log(`  Failure rate: ${((failures.length / events.length) * 100).toFixed(1)}%`);
        console.log(`  Low scores: ${lowScores.length} events`);
        console.log(`  Average score: ${avgScore.toFixed(2)}`);
        
        // Alert conditions
        if (failures.length > events.length * 0.3) {
            console.log('⚠️  WARNING: High failure rate detected!');
        }
        if (avgScore < 5.0) {
            console.log('⚠️  WARNING: Low average score detected!');
        }

    } catch (error) {
        handleError(error);
    }
}

// Example 12: Events validation showcase
async function example12() {
    try {
        console.log('\nExample 12: Events API validation showcase');
        
        // This will demonstrate various validation errors
        console.log('Testing validation...');
        
        // Test 1: Invalid experiment ID
        try {
            await client.getExperimentEvents('');
        } catch (error) {
            console.log('✓ Caught missing experiment ID:', error.message);
        }
        
        // Test 2: Invalid date format
        try {
            await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
                startDate: 'invalid-date'
            });
        } catch (error) {
            console.log('✓ Caught invalid date format:', error.message);
        }
        
        // Test 3: Invalid score range
        try {
            await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
                minScore: 15
            });
        } catch (error) {
            console.log('✓ Caught invalid score range:', error.message);
        }
        
        // Test 4: Invalid pagination
        try {
            await client.getExperimentEvents('47ae87b0-a896-452e-b5a5-f176f6427e58', {
                page: 0
            });
        } catch (error) {
            console.log('✓ Caught invalid page number:', error.message);
        }
        
        console.log('All validation tests passed ✅');

    } catch (error) {
        handleError(error);
    }
}

// Utility function for error handling
function handleError(error) {
    if (error instanceof ValidationError) {
        console.error('❌ Validation Error:', error.message);
    } else if (error instanceof AssignmentNotFoundError) {
        console.error('❌ Assignment Not Found:', error.message);
    } else if (error instanceof LaikaServiceError) {
        console.error('❌ Service Error:', error.message, 'Status:', error.statusCode);
    } else if (error instanceof NetworkError) {
        console.error('❌ Network Error:', error.message);
    } else {
        console.error('❌ Unexpected Error:', error.message);
    }
}

// Run examples
async function runExamples() {
    console.log('🚀 Running Prompt Test Client Examples\n');

    await example1();
    await example2();
    await example3();
    await example4();
    await example5();
    await example6();
    await example7();
    await example8();
    await example9();
    await example10();
    await example11();
    await example12();

    // Cleanup
    client.destroy();
    console.log('\n✨ All examples completed');
}

// Export for testing
module.exports = {
    runExamples,
    client
};

// Run if called directly
if (require.main === module) {
    runExamples().catch(console.error);
}