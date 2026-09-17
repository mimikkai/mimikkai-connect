/**
 * Type definitions for MimikkAi authentication in the CLI.
 * (Ported from mimikkai-connector-copilot/src/auth/mimikkaiAuthTypes.ts)
 */

export interface MimikkaiAuthConfig {
  /** Base URL of the MimikkAi authentication service (backend API). */
  authServiceUrl: string;
  /** Base URL of the MimikkAi frontend (user-facing panel). */
  frontendUrl: string;
  /** Base URL of the LiteLLM proxy. */
  litellmBaseUrl: string;
  /** OAuth client name sent to the device-authorization endpoint. */
  clientName: string;
}

export const DEFAULT_AUTH_CONFIG: MimikkaiAuthConfig = {
  authServiceUrl: "https://service.mimikkai.ru",
  frontendUrl: "https://panel.mimikkai.ru",
  litellmBaseUrl: "https://litellm.mimikkai.ru",
  clientName: "mimikkai-connect",
};

/** Result of a successful authentication — the API token plus user info. */
export interface MimikkaiAuthResult {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

/** Response from `POST /api/auth/device/authorize`. */
export interface DeviceAuthorizeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  /** Lifetime of the device code in seconds. */
  expires_in: number;
  /** Recommended polling interval in seconds. */
  interval: number;
}

/** Response from token validation (GraphQL `userViewer`). */
export interface TokenValidationResponse {
  valid: boolean;
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

/** Result of fetching the LiteLLM virtual key via GraphQL. */
export interface LitellmKeyResult {
  /** The full LiteLLM virtual key (starts with `sk-`). */
  virtualKey: string;
}