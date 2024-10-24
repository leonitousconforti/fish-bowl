import { Path, Error as PlatformError } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { DockerEngine, MobyConvey, MobyEndpoints } from "the-moby-effect";

const DOCKER_IMAGE_TAG = "test:latest";

export const buildImage = (): Effect.Effect<
    void,
    MobyEndpoints.ImagesError | PlatformError.PlatformError,
    MobyEndpoints.Images | Path.Path
> =>
    Effect.gen(function* () {
        const path = yield* Path.Path;
        const context = yield* path.fromFileUrl(new URL("../emulator", import.meta.url));
        const contextStream = MobyConvey.packBuildContextIntoTarballStream(context, [
            "default.pulse-audio",
            "Dockerfile",
            "emulator_access.json",
            "entrypoint.sh",
            "envoy.yaml",
            "nginx.conf",
        ]);

        const buildStream = DockerEngine.build({
            tag: DOCKER_IMAGE_TAG,
            context: Stream.provideLayer(contextStream, NodeContext.layer),
        });

        yield* MobyConvey.followProgressInConsole(buildStream);
    });

export const architect = (): Effect.Effect<string, MobyEndpoints.ContainersError, MobyEndpoints.Containers> =>
    DockerEngine.run({
        name: `shocae${Math.floor(Math.random() * (999_999 - 100_000 + 1)) + 100_000}`,
        spec: {
            Image: DOCKER_IMAGE_TAG,
            Env: ["DISPLAY=:0"],
            HostConfig: {
                DeviceRequests: [
                    { Count: -1, Driver: "nvidia", Capabilities: [["gpu"]], DeviceIDs: null, Options: null },
                ],
                Devices: [{ CgroupPermissions: "mrw", PathInContainer: "/dev/kvm", PathOnHost: "/dev/kvm" }],
                PortBindings: {
                    "5554/tcp": [{ HostPort: "0" }],
                    "5555/tcp": [{ HostPort: "0" }],
                    "8080/tcp": [{ HostPort: "0" }],
                    "8081/tcp": [{ HostPort: "0" }],
                    "8554/tcp": [{ HostPort: "0" }],
                    "8555/tcp": [{ HostPort: "0" }],
                    "27042/tcp": [{ HostPort: "0" }],
                },
                Binds: [
                    "/tmp/.X11-unix:/tmp/.X11-unix",
                    "/etc/timezone:/etc/timezone:ro",
                    "/etc/localtime:/etc/localtime:ro",
                    "/usr/share/vulkan/icd.d:/usr/share/vulkan/icd.d:ro",
                    "/usr/share/vulkan/implicit_layer.d:/usr/share/vulkan/implicit_layer.d:ro",
                    "/etc/vulkan/icd.d/nvidia_icd.json:/etc/vulkan/icd.d/nvidia_icd.json:ro",
                ],
            },
        },
    }).pipe(Effect.map(({ Name }) => Name));
