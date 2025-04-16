/**
 * Http helpers for sending and receiving Protobuf with effect.
 *
 * @since 1.0.0
 */

import * as Protobuf from "@bufbuild/protobuf";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as Effect from "effect/Effect";

import * as GooglePlay from "./GooglePlay_pb.js";
import * as internalHttp from "./internal/http.js";

/**
 * @since 1.0.0
 * @category Encode
 */
export const encodeRequest: {
    // Data-last signature
    <Description extends Protobuf.DescMessage>(
        description: Description,
        body: Protobuf.MessageInitShape<Description>,
        options?: Partial<Protobuf.BinaryWriteOptions> | undefined
    ): (
        request: HttpClientRequest.HttpClientRequest
    ) => Effect.Effect<HttpClientRequest.HttpClientRequest, HttpClientError.HttpClientError, never>;
    // Data-first signature
    <Description extends Protobuf.DescMessage>(
        request: HttpClientRequest.HttpClientRequest,
        description: Description,
        body: Protobuf.MessageInitShape<Description>,
        options?: Partial<Protobuf.BinaryWriteOptions> | undefined
    ): Effect.Effect<HttpClientRequest.HttpClientRequest, HttpClientError.HttpClientError, never>;
} = internalHttp.encodeRequest;

/**
 * @since 1.0.0
 * @category Decode
 */
export const decodeResponse: {
    // Data-last signature
    <
        ExtractPayload extends Exclude<
            keyof Protobuf.MessageShape<typeof GooglePlay.PayloadSchema>,
            keyof Protobuf.Message<"Payload">
        >,
    >(
        extractPayload: ExtractPayload,
        options?: Partial<Protobuf.BinaryReadOptions> | undefined
    ): (
        response: HttpClientResponse.HttpClientResponse
    ) => Effect.Effect<
        Exclude<Protobuf.MessageShape<typeof GooglePlay.PayloadSchema>[ExtractPayload], undefined>,
        HttpClientError.HttpClientError,
        never
    >;
    // Data-first signature
    <
        ExtractPayload extends Exclude<
            keyof Protobuf.MessageShape<typeof GooglePlay.PayloadSchema>,
            keyof Protobuf.Message<"Payload">
        >,
    >(
        response: HttpClientResponse.HttpClientResponse,
        extractPayload: ExtractPayload,
        options?: Partial<Protobuf.BinaryReadOptions> | undefined
    ): Effect.Effect<
        Exclude<Protobuf.MessageShape<typeof GooglePlay.PayloadSchema>[ExtractPayload], undefined>,
        HttpClientError.HttpClientError,
        never
    >;
} = internalHttp.decodeResponse;
