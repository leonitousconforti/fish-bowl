import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { architect } from "@shocae/architect";
import { Console, Effect, Function, Layer } from "effect";
import { DockerEngine, Connection as MobyConnection } from "the-moby-effect";

const localDocker = Function.pipe(
    MobyConnection.connectionOptionsFromPlatformSystemSocketDefault(),
    Effect.map(DockerEngine.layerNodeJS),
    Layer.unwrapEffect
);

const program = Effect.gen(function* () {
    const result = yield* architect({ networkMode: "host" });
    yield* Console.log(result);
});

program.pipe(Effect.provide(localDocker)).pipe(Effect.provide(NodeContext.layer)).pipe(NodeRuntime.runMain());
