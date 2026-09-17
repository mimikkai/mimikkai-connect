/**
 * Auth error types for mimikkai-connect.
 * (Ported from mimikkai-connector-copilot/src/auth/mimikkaiAuthErrors.ts)
 */

export class MimikkaiAuthExpiredError extends Error {
  constructor() {
    super("The device code has expired");
    this.name = "MimikkaiAuthExpiredError";
  }
}

export class MimikkaiAuthCancelledError extends Error {
  constructor() {
    super("Authorization was cancelled");
    this.name = "MimikkaiAuthCancelledError";
  }
}

export class MimikkaiAuthNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimikkaiAuthNetworkError";
  }
}

export class MimikkaiAuthUnexpectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimikkaiAuthUnexpectedError";
  }
}