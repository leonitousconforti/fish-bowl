import { NodeRuntime } from "@effect/platform-node";
import { architect, buildImage } from "@shocae/control";
import { Console, Effect, Function, Layer } from "effect";
import { DockerEngine, MobyConnection, MobyConvey } from "the-moby-effect";

const DockerLive = Function.pipe(
    MobyConnection.connectionOptionsFromPlatformSystemSocketDefault,
    Effect.map(DockerEngine.layerNodeJS),
    Layer.unwrapEffect
);

Effect.gen(function* () {
    const buildStream = buildImage();
    yield* MobyConvey.followProgressInConsole(buildStream);
    const { containerName, installApk, ports } = yield* architect();
    yield* Console.log(containerName);
    yield* Console.log(ports);
    yield* installApk("com.nimblebit.tinytower");
})
    .pipe(Effect.scoped)
    .pipe(Effect.provide(DockerLive))
    .pipe(NodeRuntime.runMain);
