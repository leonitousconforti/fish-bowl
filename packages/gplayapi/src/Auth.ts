/**
 * Authentication helpers for google play services.
 *
 * @since 1.0.0
 */

import * as HttpClient from "@effect/platform/HttpClient";
import * as Layer from "effect/Layer";
import * as internalAuth from "./internal/auth.js";

/**
 * @since 1.0.0
 * @category Auth
 */
export const makeAuthenticatedHttpClient: ({
    email,
    locale,
    timezone,
    token,
}: {
    email: string;
    token: string;
    locale?: string | undefined;
    timezone?: string | undefined;
}) => Layer.Layer<HttpClient.HttpClient, never, HttpClient.HttpClient> = internalAuth.makeAuthenticatedHttpClient;
