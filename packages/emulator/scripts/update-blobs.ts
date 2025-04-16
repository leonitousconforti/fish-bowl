import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Blobs from "../src/blobs.js";

const program = Effect.gen(function* () {
    const path = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const cwd = yield* path.fromFileUrl(new URL(".", import.meta.url));
    const outputFolder = path.join(cwd, "..", "docker");

    yield* fileSystem.writeFileString(path.join(outputFolder, "default.pulse-audio"), Blobs.PULSE_AUDIO_BLOB);
    yield* fileSystem.writeFileString(path.join(outputFolder, "Dockerfile"), Blobs.DOCKERFILE_BLOB);
    yield* fileSystem.writeFileString(path.join(outputFolder, "emulator_access.json"), Blobs.EMULATOR_ACCESS_BLOB);
    yield* fileSystem.writeFileString(path.join(outputFolder, "entrypoint.sh"), Blobs.ENTRYPOINT_BLOB);
    yield* fileSystem.writeFileString(path.join(outputFolder, "envoy.yaml"), Blobs.ENVOY_BLOB);
    yield* fileSystem.writeFileString(path.join(outputFolder, "nginx.conf"), Blobs.NGINX_BLOB);
});

program.pipe(Effect.provide(NodeContext.layer)).pipe(NodeRuntime.runMain);
