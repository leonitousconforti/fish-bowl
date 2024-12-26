import { NodeRuntime } from "@effect/platform-node";
import { architect, buildImage } from "@shocae/control";
import { Console, Effect, Function, Layer, Stream } from "effect";
import { DockerEngine, MobyConnection, MobyConvey, MobyEndpoints } from "the-moby-effect";

import * as path from "node:path";
import * as tar from "tar-fs";

const apkFile = "/workspaces/fish-bowl/packages/cli/com.nimblebit.tinytower.apk";

const apkStream = Stream.fromAsyncIterable(
    tar.pack(path.dirname(apkFile), { entries: [path.basename(apkFile)] }),
    () =>
        new MobyEndpoints.ContainersError({
            method: "putArchiveStream",
            cause: new Error("error packing the put archive"),
        })
);

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
    yield* installApk("com.nimblebit.tinytower.apk", apkStream);
})
    .pipe(Effect.scoped)
    .pipe(Effect.provide(DockerLive))
    .pipe(NodeRuntime.runMain);
