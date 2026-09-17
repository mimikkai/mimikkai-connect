/**
 * Token validation client for MimikkAi (GraphQL `userViewer` query).
 * (Ported from mimikkai-connector-copilot/src/auth/mimikkaiTokenClient.ts)
 */

import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";
import { type MimikkaiAuthConfig, type TokenValidationResponse } from "./types.ts";
import { MimikkaiAuthNetworkError, MimikkaiAuthUnexpectedError } from "./errors.ts";

const USER_VIEWER_QUERY = `
  query UserViewer {
    userViewer {
      id
      name
      email
      email_verified_at
      created_at
      updated_at
      phone { e164 country_code formatted }
    }
  }
`;

interface GraphQLUserViewerResponse {
  data?: {
    userViewer?: {
      id: string;
      name: string;
      email: string;
    } | null;
  };
  errors?: readonly { message?: string }[];
}

/**
 * Validate a token against the MimikkAi GraphQL endpoint.
 * POST `{authServiceUrl}/graphql` with the `UserViewer` query and the
 * token in the `Authorization` header. Returns `{ valid, user? }`.
 */
export async function validateToken(config: MimikkaiAuthConfig, token: string): Promise<TokenValidationResponse> {
  const url = `${config.authServiceUrl}/graphql`;
  logger.debug("auth.token", `validating token=${obfuscate(token)} against ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: USER_VIEWER_QUERY }),
    });
  } catch (err) {
    logger.error("auth.token", `validation network error: ${err instanceof Error ? err.message : String(err)}`);
    throw new MimikkaiAuthNetworkError(
      `Failed to reach token verification endpoint: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    logger.error("auth.token", `validation failed with HTTP ${response.status}`);
    throw new MimikkaiAuthUnexpectedError(`Token validation failed with status ${response.status}`);
  }

  const body = (await response.json()) as GraphQLUserViewerResponse;

  // GraphQL returns 200 even on error — check for the `errors` array
  if (body.errors && body.errors.length > 0) {
    logger.debug("auth.token", `token invalid: ${body.errors[0]?.message ?? "unknown error"}`);
    return { valid: false };
  }

  const viewer = body.data?.userViewer;
  if (!viewer) {
    logger.debug("auth.token", "token invalid: userViewer is null");
    return { valid: false };
  }

  logger.info("auth.token", `token valid for user ${viewer.name} <${viewer.email}>`);
  return {
    valid: true,
    user: {
      id: parseInt(viewer.id, 10) || 0,
      name: viewer.name,
      email: viewer.email,
    },
  };
}