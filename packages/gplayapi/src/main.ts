import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";

import { BulkDetailsRequestSchema, BulkDetailsResponse, BuyResponse, DetailsResponse } from "./GooglePlay_pb.js";
import { decodeResponse, encodeRequest } from "./Http.js";

export const details = (
    bundleIdentifier: string
): Effect.Effect<DetailsResponse, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
    Function.pipe(
        HttpClientRequest.get("/fdfe/details", { urlParams: { doc: bundleIdentifier } }),
        HttpClient.execute,
        Effect.flatMap(decodeResponse("detailsResponse")),
        Effect.scoped
    );

export const bulkDetails = (
    bundleIdentifier: string
): Effect.Effect<BulkDetailsResponse, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
    Function.pipe(
        HttpClientRequest.post("/fdfe/bulkDetails"),
        encodeRequest(BulkDetailsRequestSchema, {
            DocId: [bundleIdentifier],
            includeChildDocs: true,
            includeDetails: true,
        }),
        Effect.flatMap(HttpClient.execute),
        Effect.flatMap(decodeResponse("bulkDetailsResponse")),
        Effect.scoped
    );

export const purchase = (
    bundleIdentifier: string
): Effect.Effect<BuyResponse, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
    Function.pipe(
        HttpClientRequest.post("/fdfe/purchase", {
            urlParams: { doc: bundleIdentifier, ot: "1", vc: "481" },
        }),
        HttpClient.execute,
        Effect.tapErrorTag("ResponseError", (error) => Effect.log("here")),
        Effect.tapErrorTag("ResponseError", (error) => Effect.log(error.response)),
        Effect.tapErrorTag("ResponseError", (error) => Effect.map(error.response.text, Console.log)),
        Effect.tapErrorTag("ResponseError", (error) => Effect.log("here")),
        Effect.flatMap(decodeResponse("buyResponse")),
        Effect.scoped
    );

export const purchaseHistory = () =>
    Function.pipe(
        HttpClientRequest.get("/fdfe/purchaseHistory"),
        HttpClient.execute,
        Effect.flatMap((response) => response.text),
        Effect.scoped
    );

Effect.gen(function* () {
    yield* Effect.log("Here");
    const result = yield* purchaseHistory();
    yield* Effect.log(result);
})
    .pipe(Effect.provide(live))
    .pipe(NodeRuntime.runMain);
