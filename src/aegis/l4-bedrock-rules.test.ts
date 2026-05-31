import { describe, expect, test } from 'bun:test';
import { BEDROCK_L4_RULES } from './l4-bedrock-rules.js';
import { classifyError } from './l4-semantic.js';
import type { ProviderError } from './types.js';

const ALL_RULES = BEDROCK_L4_RULES;

describe('l4-bedrock-rules — Bedrock-specific error reclassification', () => {
  test('ThrottlingException is reclassified as fallback-eligible', () => {
    const err: ProviderError = {
      status: 400,
      type: 'ThrottlingException',
      raw_message: 'Too many requests, please wait before trying again.',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match).not.toBeNull();
    expect(match?.message_class).toBe('bedrock_throttling');
    expect(match?.action_taken).toBe('fallback_provider');
  });

  test('ServiceQuotaExceededException reclassified', () => {
    const err: ProviderError = {
      status: 400,
      type: 'ServiceQuotaExceededException',
      raw_message: 'You have exceeded your service quota for this resource.',
    };
    const match = classifyError(err, 'bedrock/meta.llama3-8b', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_quota_exceeded');
    expect(match?.action_taken).toBe('fallback_provider');
  });

  test('on-demand throughput unsupported regex catches', () => {
    const err: ProviderError = {
      status: 400,
      raw_message:
        "Invocation of model ID anthropic.claude with on-demand throughput isn't supported.",
    };
    const match = classifyError(err, 'bedrock/anthropic.claude', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_quota_exceeded');
  });

  test('ModelStreamErrorException → fallback_provider', () => {
    const err: ProviderError = {
      status: 200,
      type: 'ModelStreamErrorException',
      raw_message: 'Streaming connection interrupted',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match?.action_taken).toBe('fallback_provider');
    expect(match?.message_class).toBe('bedrock_stream_error');
  });

  test('ModelTimeoutException → fallback_model (smaller model)', () => {
    const err: ProviderError = {
      status: 408,
      type: 'ModelTimeoutException',
      raw_message: 'Model invocation timed out',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match?.action_taken).toBe('fallback_model');
  });

  test('Anthropic first-time use-case prompt → fallback_provider away from Anthropic', () => {
    const err: ProviderError = {
      status: 403,
      raw_message:
        'AccessDeniedException: You need to submit use case details to access anthropic models',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_access_denied_anthropic');
    expect(match?.action_taken).toBe('fallback_provider');
  });

  test('InternalServerException → fallback_provider', () => {
    const err: ProviderError = {
      status: 500,
      type: 'InternalServerException',
      raw_message: 'us-east-1 region temporary issue',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_region_outage');
  });

  test('ValidationException for missing model → fallback_model', () => {
    const err: ProviderError = {
      status: 400,
      type: 'ValidationException',
      raw_message: 'The model anthropic.claude-2 is not found in this region',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-2', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_validation_model');
    expect(match?.action_taken).toBe('fallback_model');
  });

  test('Guardrail intervention → pass_through (not a failure)', () => {
    const err: ProviderError = {
      status: 200,
      raw_message: 'Output blocked by guardrail policy.',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match?.message_class).toBe('bedrock_guardrail_blocked');
    expect(match?.action_taken).toBe('pass_through');
  });

  test('unknown Bedrock error is NOT caught by these rules (falls through to generic L4)', () => {
    const err: ProviderError = {
      status: 500,
      type: 'SomethingNewException',
      raw_message: 'Unrecognized failure mode',
    };
    const match = classifyError(err, 'bedrock/anthropic.claude-3-5-sonnet', ALL_RULES);
    expect(match).toBeNull();
  });
});
