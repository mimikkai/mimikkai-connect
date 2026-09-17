/**
 * LiteLLM virtual key client for MimikkAi (GraphQL `GetUserApiKey`).
 * (Ported from mimikkai-connector-copilot/src/auth/mimikkaiLitellmKeyClient.ts)
 *
 * LiteLLM does not accept Sanctum tokens — it requires a virtual key
 * starting with `sk-`, exposed via `userViewer { litellmVirtualKey }`.
 * Read-only: if the key is missing or masked, an error is thrown.
 */

import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";
import { type LitellmKeyResult, type MimikkaiAuthConfig } from "./types.ts";
import { MimikkaiAuthNetworkError, MimikkaiAuthUnexpectedError } from "./errors.ts";

const LITELLM_KEY_QUERY = `
  query GetUserApiKey {
    userViewer {
      id
      name
      email
      hasLitellmVirtualKey
      litellmKeyStatus
      litellmVirtualKey
    }
  }
`;

interface GraphQLLitellmKeyResponse {
  data?: {
    userViewer?: {
      id: string;
      name: string;
      email: string;
      hasLitellmVirtualKey: boolean;
      litellmKeyStatus: string | null;
      litellmVirtualKey: string | null;
    } | null;
  };
  errors?: readonly { message?: string }[];
}

/**
 * Fetch the LiteLLM virtual key for the authenticated user.
 * Queries `userViewer { litellmVirtualKey }` once; read-only.
 *
 * @throws {MimikkaiAuthUnexpectedError} if the key is missing or masked.
 * @throws {MimikkaiAuthNetworkError} if the request fails.
 */
export async function fetchLitellmVirtualKey(config: MimikkaiAuthConfig, token: string): Promise<LitellmKeyResult> {
  const url = `${config.authServiceUrl}/graphql`;
  logger.debug("auth.litellm", `fetching LiteLLM key from ${url} token=${obfuscate(token)}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        operationName: "GetUserApiKey",
        query: LITELLM_KEY_QUERY,
        variables: {},
      }),
    });
  } catch (err) {
    logger.error("auth.litellm", `query network error: ${err instanceof Error ? err.message : String(err)}`);
    throw new MimikkaiAuthNetworkError(
      `Failed to reach GraphQL endpoint for LiteLLM key: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    logger.error("auth.litellm", `query failed with HTTP ${response.status}`);
    throw new MimikkaiAuthUnexpectedError(`LiteLLM key query failed with status ${response.status}`);
  }

  const body = (await response.json()) as GraphQLLitellmKeyResponse;
  if (body.errors && body.errors.length > 0) {
    logger.error("auth.litellm", `GraphQL error: ${body.errors[0]?.message ?? "unknown"}`);
    throw new MimikkaiAuthUnexpectedError(
      `GraphQL error fetching LiteLLM key: ${body.errors[0]?.message ?? "unknown"}`
    );
  }

  const viewer = body.data?.userViewer;
  if (!viewer) {
    throw new MimikkaiAuthUnexpectedError("userViewer returned null");
  }

  const rawKey = viewer.litellmVirtualKey;
  if (rawKey && rawKey.startsWith("sk-") && !rawKey.includes("...")) {
    logger.info("auth.litellm", `LiteLLM key fetched: ${obfuscate(rawKey)} status=${viewer.litellmKeyStatus ?? "n/a"}`);
    return { virtualKey: rawKey };
  }

  logger.error(
    "auth.litellm",
    `unable to fetch full LiteLLM key: hasKey=${viewer.hasLitellmVirtualKey} status=${viewer.litellmKeyStatus} masked=${obfuscate(rawKey ?? "")}`
  );
  throw new MimikkaiAuthUnexpectedError(
    "Unable to obtain the full LiteLLM virtual key. The key is masked or missing. " +
      "Please try disconnecting and reconnecting your account."
  );
}