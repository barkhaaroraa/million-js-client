# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js client library for the LaikaTest Platform. It provides automatic context binding and intelligent caching for managing prompt experiments and tracking outcomes.

## Development Commands

### Testing
```bash
node test.js
```
- Runs a comprehensive test suite with zero dependencies
- Uses a built-in mock server for testing HTTP requests
- Tests cover all client functionality, error handling, and caching behavior

### Usage Examples
```bash
node usage-examples.js
```
- Demonstrates all client features with working examples
- Shows user-based, session-based, and random assignment patterns
- Includes error handling and fallback strategies

## Architecture

### Core Files
- `laika-test-client.js` - Main client implementation with zero dependencies
- `index.d.ts` - TypeScript definitions for all interfaces and error types
- `test.js` - Complete test suite with mock server implementation
- `usage-examples.js` - Working examples for all features

### Key Components

#### LaikaTestClient Class
- Entry point for all API interactions
- Manages automatic assignment caching with TTL
- Provides three assignment types: user-based, session-based, random
- Handles automatic assignment ID resolution for tracking

#### AssignmentCache Class
- TTL-based caching system (30 minutes default)
- Automatic cleanup every 5 minutes
- Memory-efficient storage of assignment metadata only
- Key format: `experimentId:userId:sessionId`

#### Error Classes
- `LaikaServiceError` - API/service-related errors
- `NetworkError` - Network/connectivity issues  
- `ValidationError` - Input validation failures
- `AssignmentNotFoundError` - Missing cached assignments

### API Patterns

#### Assignment Flow
1. Call `getPromptForUser()`, `getPromptForSession()`, or `getRandomPrompt()`
2. Use returned prompt content in application
3. Track outcome with `trackSuccess()`, `trackFailure()`, or `trackOutcome()`
4. Assignment IDs automatically resolved from cache (except random assignments)

#### Caching Strategy
- User/session assignments cached for consistency across calls
- Random assignments never cached (new assignment each call)
- Cache keys combine experiment ID with user/session identifiers
- Expired entries cleaned up automatically

#### Error Handling
- Service errors should trigger fallback prompts
- Network errors may use cached data or retry logic
- Validation errors indicate developer mistakes
- Assignment not found errors mean tracking called before assignment

## Important Notes

- Zero external dependencies - pure Node.js implementation
- Client supports both HTTP and HTTPS endpoints
- Default timeout is 10 seconds, configurable via options
- Always call `client.destroy()` to clean up background processes
- API key required for all operations
- TypeScript definitions provided for type safety