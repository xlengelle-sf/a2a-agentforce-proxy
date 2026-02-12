import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  UpstreamError,
} from '../../src/shared/errors.js';

describe('Error classes', () => {
  it('AppError has statusCode and code', () => {
    const err = new AppError('test', 418, 'TEAPOT');
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthenticationError defaults to 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('NotFoundError defaults to 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it('ValidationError defaults to 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('bad input');
  });

  it('UpstreamError has upstream property', () => {
    const err = new UpstreamError('service down', 'agentforce');
    expect(err.statusCode).toBe(502);
    expect(err.upstream).toBe('agentforce');
  });
});
