import * as Protobuf from "@bufbuild/protobuf";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Predicate from "effect/Predicate";

import { PayloadSchema, ResponseWrapperSchema } from "../GooglePlay_pb.js";

/**
 * @since 1.0.0
 * @internal
 */
export const encodeRequest = Function.dual<
    // Data-last signature
    <Description extends Protobuf.DescMessage>(
        description: Description,
        body: Protobuf.MessageInitShape<Description>,
        options?: Partial<Protobuf.BinaryWriteOptions> | undefined
    ) => (
        request: HttpClientRequest.HttpClientRequest
    ) => Effect.Effect<HttpClientRequest.HttpClientRequest, HttpClientError.HttpClientError, never>,
    // Data-first signature
    <Description extends Protobuf.DescMessage>(
        request: HttpClientRequest.HttpClientRequest,
        description: Description,
        body: Protobuf.MessageInitShape<Description>,
        options?: Partial<Protobuf.BinaryWriteOptions> | undefined
    ) => Effect.Effect<HttpClientRequest.HttpClientRequest, HttpClientError.HttpClientError, never>
>(
    // Data first if the first argument is an http request
    (...arguments_) => Predicate.hasProperty(arguments_[0], HttpClientRequest.TypeId),

    // Body implementation
    Effect.fn("encodeRequest")(function* <Description extends Protobuf.DescMessage>(
        request: HttpClientRequest.HttpClientRequest,
        description: Description,
        body: Protobuf.MessageInitShape<Description>,
        options?: Partial<Protobuf.BinaryWriteOptions> | undefined
    ) {
        const messageType = description.name;
        yield* Effect.annotateCurrentSpan("messageType", messageType);

        const bytes = yield* Effect.try({
            try: () =>
                Protobuf.toBinary(
                    description,
                    Protobuf.create(description, body),
                    options ?? ({ writeUnknownFields: true } as const)
                ),
            catch: (cause) =>
                new HttpClientError.RequestError({
                    cause,
                    request,
                    reason: "Encode",
                    description: `Could not encode message of type ${messageType}`,
                }),
        });

        const applyBody = HttpClientRequest.bodyUint8Array(bytes, "application/x-protobuf");
        return applyBody(request);
    })
);

/**
 * @since 1.0.0
 * @internal
 */
export const decodeResponse = Function.dual<
    // Data-last signature
    <
        ExtractPayload extends Exclude<
            keyof Protobuf.MessageShape<typeof PayloadSchema>,
            keyof Protobuf.Message<"Payload">
        >,
    >(
        extractPayload: ExtractPayload,
        options?: Partial<Protobuf.BinaryReadOptions> | undefined
    ) => (
        response: HttpClientResponse.HttpClientResponse
    ) => Effect.Effect<
        Exclude<Protobuf.MessageShape<typeof PayloadSchema>[ExtractPayload], undefined>,
        HttpClientError.HttpClientError,
        never
    >,
    // Data-first signature
    <
        ExtractPayload extends Exclude<
            keyof Protobuf.MessageShape<typeof PayloadSchema>,
            keyof Protobuf.Message<"Payload">
        >,
    >(
        response: HttpClientResponse.HttpClientResponse,
        extractPayload: ExtractPayload,
        options?: Partial<Protobuf.BinaryReadOptions> | undefined
    ) => Effect.Effect<
        Exclude<Protobuf.MessageShape<typeof PayloadSchema>[ExtractPayload], undefined>,
        HttpClientError.HttpClientError,
        never
    >
>(
    // Data first if the first argument is an http response
    (...arguments_) => Predicate.hasProperty(arguments_[0], HttpClientResponse.TypeId),

    // Body implementation
    Effect.fn("decodeResponse")(function* <
        ExtractPayload extends Exclude<
            keyof Protobuf.MessageShape<typeof PayloadSchema>,
            keyof Protobuf.Message<"Payload">
        >,
    >(
        response: HttpClientResponse.HttpClientResponse,
        extractPayload: ExtractPayload,
        options?: Partial<Protobuf.BinaryReadOptions> | undefined
    ) {
        const messageType = ResponseWrapperSchema.name;
        yield* Effect.annotateCurrentSpan("messageType", messageType);

        const arrayBuffer = yield* response.arrayBuffer;
        const responseWrapper = yield* Effect.try({
            try: () =>
                Protobuf.fromBinary(
                    ResponseWrapperSchema,
                    new Uint8Array(arrayBuffer),
                    options ?? ({ readUnknownFields: true } as const)
                ),
            catch: (cause) =>
                new HttpClientError.ResponseError({
                    cause,
                    response,
                    reason: "Decode",
                    request: response.request,
                    description: `Could not decode message of type ${messageType}`,
                }),
        });

        const payload = responseWrapper.payload;
        if (Predicate.isUndefined(payload)) {
            return yield* new HttpClientError.ResponseError({
                response,
                reason: "Decode",
                request: response.request,
                description: `Message of type ${messageType} has no payload`,
            });
        }

        const extracted = payload[extractPayload];
        if (Predicate.isUndefined(extracted)) {
            return yield* new HttpClientError.ResponseError({
                response,
                reason: "Decode",
                request: response.request,
                description: `Message of type ${messageType} has no payload of type ${extractPayload}`,
            });
        }

        type Out = Exclude<Protobuf.MessageShape<typeof PayloadSchema>[ExtractPayload], undefined>;
        return extracted as Out;
    })
);
