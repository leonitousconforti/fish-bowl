import * as path from "node:path";

import { Socket } from "@effect/platform";
import { ParseResult } from "@effect/schema";
import { Effect, Stream } from "effect";
import { DockerEngine, Endpoints as MobyEndpoints } from "the-moby-effect";

/**
 * Given the path to an apk, will install it on the android emulator. Will
 * replace the existing application (if present), will downgrade the version (if
 * supplied a lower version of the application), allows tests packages and will
 * grant all runtime permissions by default.
 */
export const installApkCommand = (apkLocation: string): string[] => [
    "/android/sdk/platform-tools/adb",
    "install",
    "-r", // Replace existing application (if present)
    "-t", // Allow test packages
    "-g", // Grant all runtime permissions
    "-d", // Allow downgrade
    apkLocation,
];

/**
 * Installs an apk into an architect container by packing the apk in a tarball
 * and asking docker to place the tarball inside the container. Docker will
 * unpack the tarball for us when we place it. Then we run the install apk
 * command inside the container blocking until it is done. We check the output
 * of the command to make sure that is completed successfully.
 */
export const installApk = ({
    apk,
    containerId,
}: {
    apk: string;
    containerId: string;
}): Effect.Effect<
    void,
    Socket.SocketError | MobyEndpoints.ExecsError | MobyEndpoints.ContainersError | ParseResult.ParseError,
    MobyEndpoints.Execs | MobyEndpoints.Containers
> =>
    Effect.gen(function* () {
        const containers: MobyEndpoints.Containers = yield* MobyEndpoints.Containers;
        yield* containers.putArchive({
            id: containerId,
            path: "/android/apks/",
            stream: Stream.empty,
        });
        const command: string[] = installApkCommand(`/android/apks/${path.basename(apk)}`);
        const output: string = yield* DockerEngine.exec({ containerId, command });
        if (!output.includes("Success"))
            yield* new MobyEndpoints.ExecsError({
                method: "installApk",
                cause: new Error(`Failed to install apk: ${output}`),
            });
    });
