import { NodeRuntime } from "@effect/platform-node";
import { architect, buildImage } from "@shocae/control";
import { Effect, Function, Layer } from "effect";
import { DockerEngine, MobyConnection, MobyConvey } from "the-moby-effect";

const DockerLive = Function.pipe(
    MobyConnection.connectionOptionsFromPlatformSystemSocketDefault,
    Effect.map(DockerEngine.layerNodeJS),
    Layer.unwrapEffect
);

Effect.gen(function* () {
    const buildStream = buildImage();
    yield* MobyConvey.followProgressInConsole(buildStream);
    return yield* architect();
})
    .pipe(Effect.map(Effect.log))
    .pipe(Effect.provide(DockerLive))
    .pipe(NodeRuntime.runMain);
