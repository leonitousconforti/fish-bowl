import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";

/**
 * @since 1.0.0
 * @internal
 */
export const makeAuthenticatedHttpClient = ({
    email,
    locale,
    timezone,
    token,
}: {
    email: string;
    token: string;
    locale?: string | undefined;
    timezone?: string | undefined;
}): Layer.Layer<HttpClient.HttpClient, never, HttpClient.HttpClient> =>
    Layer.function(
        HttpClient.HttpClient,
        HttpClient.HttpClient,
        Function.flow(
            HttpClient.filterStatusOk,
            HttpClient.mapRequest(HttpClientRequest.prependUrl("https://android.clients.google.com")),
            HttpClient.mapRequest(HttpClientRequest.setHeaders(defaultHeaders)),
            HttpClient.mapRequest(HttpClientRequest.setHeader("Authorization", `Bearer ${token}`))
        )
    );
