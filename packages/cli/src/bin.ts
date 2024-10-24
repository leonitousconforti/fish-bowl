import { NodeRuntime } from "@effect/platform-node";
import { architect, buildImage } from "@shocae/control";
import { Effect, Function, Layer } from "effect";
import { DockerEngine, MobyConnection } from "the-moby-effect";

const layerMain = Function.pipe(
    MobyConnection.connectionOptionsFromPlatformSystemSocketDefault,
    Effect.map(DockerEngine.layerNodeJS),
    Layer.unwrapEffect
);

Effect.gen(function* () {
    yield* buildImage();
    return yield* architect();
})
    .pipe(Effect.map(Effect.log))
    .pipe(Effect.provide(layerMain))
    .pipe(NodeRuntime.runMain);
