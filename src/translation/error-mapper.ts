import { AppError, AuthenticationError, NotFoundError, ValidationError, UpstreamError } from '../shared/errors.js';
import type { JsonRpcError } from '../a2a/types.js';

/** Standard JSON-RPC 2.0 error codes. */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

/** Application-specific JSON-RPC error codes. */
export const RPC_AUTH_ERROR = -32001;
export const RPC_RATE_LIMITED = -32005;

/**
 * Map an application error to a JSON-RPC error object.
 */
export function mapErrorToJsonRpc(err: unknown): JsonRpcError {
  if (err instanceof AuthenticationError) {
    return { code: RPC_AUTH_ERROR, message: err.message };
  }

  if (err instanceof NotFoundError) {
    return { code: RPC_AUTH_ERROR, message: err.message };
  }

  if (err instanceof ValidationError) {
    return { code: RPC_INVALID_PARAMS, message: err.message };
  }

  if (err instanceof UpstreamError) {
    const msg = err.message.includes('timed out')
      ? 'Internal error: upstream timeout'
      : `Internal error: ${err.message}`;
    return { code: RPC_INTERNAL_ERROR, message: msg };
  }

  if (err instanceof AppError) {
    return { code: RPC_INTERNAL_ERROR, message: err.message };
  }

  if (err instanceof Error) {
    return { code: RPC_INTERNAL_ERROR, message: 'Internal error' };
  }

  return { code: RPC_INTERNAL_ERROR, message: 'Internal error' };
}
