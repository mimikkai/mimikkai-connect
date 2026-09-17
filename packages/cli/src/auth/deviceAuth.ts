/**
 * Device Authorization flow client for MimikkAi.
 * (Ported from mimikkai-connector-copilot/src/auth/mimikkaiDeviceAuthClient.ts,
 * StructuredLogger replaced with the CLI logger.)
 */

import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";
import {
  type DeviceAuthorizeResponse,
  type MimikkaiAuthConfig,
  type MimikkaiAuthResult,
} from "./types.ts";
import {
  MimikkaiAuthExpiredError,
  MimikkaiAuthNetworkError,
  MimikkaiAuthUnexpectedError,
} from "./errors.ts";

/** Default exponential backoff base (ms) for network retries. */
const NETWORK_RETRY_BASE_MS = 1000;
/** Maximum network retries before giving up. */
const MAX_NETWORK_RETRIES = 3;

/**
 * Rewrite the host of verification URLs returned by the backend so the
 * user is sent to the frontend panel (panel.mimikkai.ru) instead of the
 * backend API (service.mimikkai.ru), preserving path and query string.
 */
function rewriteVerificationUrls(data: DeviceAuthorizeResponse, frontendUrl: string): DeviceAuthorizeResponse {
  const frontend = frontendUrl.replace(/\/+$/, "");

  const rewrite = (original: string): string => {
    try {
      const parsed = new URL(original);
      const replacement = new URL(frontend);
      parsed.protocol = replacement.protocol;
      parsed.host = replacement.host;
      return parsed.toString();
    } catch {
      return original;
    }
  };

  return {
    ...data,
    verification_uri: rewrite(data.verification_uri),
    verification_uri_complete: rewrite(data.verification_uri_complete),
  };
}

/**
 * Request a device authorization code.
 * POST `{authServiceUrl}/api/auth/device/authorize` with `{ client_name }`.
 */
export async function authorizeDevice(config: MimikkaiAuthConfig): Promise<DeviceAuthorizeResponse> {
  const url = `${config.authServiceUrl}/api/auth/device/authorize`;
  logger.debug("auth.device", `authorize requested: ${url} client=${config.clientName}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: config.clientName }),
    });
  } catch (err) {
    logger.error("auth.device", `authorize network error: ${err instanceof Error ? err.message : String(err)}`);
    throw new MimikkaiAuthNetworkError(
      `Failed to reach device authorize endpoint: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    logger.error("auth.device", `authorize failed with HTTP ${response.status}`);
    throw new MimikkaiAuthUnexpectedError(`Device authorize failed with status ${response.status}`);
  }

  const data = (await response.json()) as Partial<DeviceAuthorizeResponse>;
  if (
    typeof data.device_code !== "string" ||
    typeof data.user_code !== "string" ||
    typeof data.verification_uri !== "string" ||
    typeof data.verification_uri_complete !== "string" ||
    typeof data.expires_in !== "number" ||
    typeof data.interval !== "number"
  ) {
    throw new MimikkaiAuthUnexpectedError("Device authorize response missing required fields");
  }

  logger.info(
    "auth.device",
    `device code issued: user_code=${data.user_code} expires_in=${data.expires_in}s interval=${data.interval}s device_code=${obfuscate(data.device_code)}`
  );

  return rewriteVerificationUrls(data as DeviceAuthorizeResponse, config.frontendUrl);
}

/**
 * Poll the token endpoint until the user confirms or the code expires.
 * - 202 + `authorization_pending` → onPending, sleep(interval), retry
 * - 200 + `token` → success
 * - 400 + `expired_token` → MimikkaiAuthExpiredError
 * - Network error → exponential backoff, max 3 retries
 */
export async function pollForToken(
  config: MimikkaiAuthConfig,
  deviceCode: string,
  options?: {
    onPending?: () => void;
    interval?: number;
    expiresIn?: number;
  }
): Promise<MimikkaiAuthResult> {
  const url = `${config.authServiceUrl}/api/auth/device/token`;
  const pollIntervalMs = (options?.interval ?? 5) * 1000;
  const expiresAt = options?.expiresIn
    ? Date.now() + options.expiresIn * 1000
    : Date.now() + 15 * 60 * 1000;

  let networkRetries = 0;

  for (;;) {
    if (Date.now() > expiresAt) {
      logger.warn("auth.device", `polling expired for device_code=${obfuscate(deviceCode)}`);
      throw new MimikkaiAuthExpiredError();
    }

    logger.debug("auth.device", `poll attempt (networkRetries=${networkRetries})`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (err) {
      networkRetries++;
      if (networkRetries > MAX_NETWORK_RETRIES) {
        logger.error("auth.device", `polling network retries exhausted (${networkRetries})`);
        throw new MimikkaiAuthNetworkError(
          `Network error during polling: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      const backoffMs = NETWORK_RETRY_BASE_MS * Math.pow(2, networkRetries - 1);
      logger.warn("auth.device", `network error, retry ${networkRetries}/${MAX_NETWORK_RETRIES} in ${backoffMs}ms`);
      await sleep(backoffMs);
      continue;
    }

    networkRetries = 0;

    if (response.status === 200) {
      const data = (await response.json()) as Partial<MimikkaiAuthResult>;
      if (typeof data.token !== "string") {
        throw new MimikkaiAuthUnexpectedError("Token response missing 'token' field");
      }
      logger.info("auth.device", `authorization complete, token=${obfuscate(data.token)}`);
      return data as MimikkaiAuthResult;
    }

    if (response.status === 202) {
      const data = (await response.json()) as { error?: string };
      if (data.error === "authorization_pending") {
        options?.onPending?.();
        await sleep(pollIntervalMs);
        continue;
      }
      throw new MimikkaiAuthUnexpectedError(`Unexpected 202 response: ${data.error ?? "unknown"}`);
    }

    if (response.status === 400) {
      const data = (await response.json()) as { error?: string };
      if (data.error === "expired_token") {
        throw new MimikkaiAuthExpiredError();
      }
      throw new MimikkaiAuthUnexpectedError(`Unexpected 400 response: ${data.error ?? "unknown"}`);
    }

    throw new MimikkaiAuthUnexpectedError(`Unexpected HTTP status ${response.status}`);
  }
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}