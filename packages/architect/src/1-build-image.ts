import * as url from "node:url";

import { NodeContext } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { DockerEngine, Convey as MobyConvey, Endpoints as MobyEndpoints } from "the-moby-effect";
import {
    ANDROID_SDK_TOOLS_VERSION,
    DOCKER_IMAGE_TAG,
    EMULATOR_SYSTEM_IMAGE_VERSION,
    EMULATOR_SYSTEM_IMAGE_VERSION_SHORT,
    EMULATOR_VERSION,
    ENVOY_PROXY_VERSION,
    FRIDA_SERVER_VERSION,
    MITM_PROXY_VERSION,
} from "./versions.js";

/** Build arguments that must be provided for the architect docker image */
export interface IArchitectDockerImageBuildArguments {
    ["EMULATOR_VERSION"]: string;
    ["MITM_PROXY_VERSION"]: string;
    ["ENVOY_PROXY_VERSION"]: string;
    ["FRIDA_SERVER_VERSION"]: string;
    ["ANDROID_SDK_TOOLS_VERSION"]: string;
    ["EMULATOR_SYSTEM_IMAGE_VERSION"]: string;
    ["EMULATOR_SYSTEM_IMAGE_VERSION_SHORT"]: string;
}

/** @internal */
export const buildImage = (): Effect.Effect<void, MobyEndpoints.ImagesError, MobyEndpoints.Images> =>
    Effect.gen(function* () {
        const context: url.URL = new URL("../emulator", import.meta.url);
        const contextStream = MobyConvey.packBuildContextIntoTarballStream(url.fileURLToPath(context), [
            "avd/config.ini",
            "avd/Pixel2.ini",
            "default.pulse-audio",
            "Dockerfile",
            "emulator_access.json",
            "entrypoint.sh",
            "envoy.yaml",
            "make-snapshot.sh",
            "nginx.conf",
        ]);

        const buildArguments = {
            EMULATOR_VERSION,
            MITM_PROXY_VERSION,
            ENVOY_PROXY_VERSION,
            FRIDA_SERVER_VERSION,
            ANDROID_SDK_TOOLS_VERSION,
            EMULATOR_SYSTEM_IMAGE_VERSION,
            EMULATOR_SYSTEM_IMAGE_VERSION_SHORT,
        } satisfies IArchitectDockerImageBuildArguments;

        const buildStream = DockerEngine.build({
            tag: DOCKER_IMAGE_TAG,
            buildArgs: buildArguments,
            context: Stream.provideLayer(contextStream, NodeContext.layer),
        });

        yield* MobyConvey.followProgressInConsole(buildStream);
    });

export default buildImage;
