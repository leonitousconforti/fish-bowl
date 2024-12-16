import {
    DOCKERFILE_BLOB,
    EMULATOR_ACCESS_BLOB,
    ENTRYPOINT_BLOB,
    ENVOY_BLOB,
    NGINX_BLOB,
    PULSE_AUDIO_BLOB,
} from "@shocae/emulator/blobs";
import { Effect, HashMap, Stream, Tuple } from "effect";
import { DockerEngine, MobyConvey, MobyEndpoints, MobySchemas } from "the-moby-effect";

const DOCKER_IMAGE_TAG = "testbdhjasndksal:latest";

export const buildImage = (): Stream.Stream<MobySchemas.JSONMessage, MobyEndpoints.ImagesError, MobyEndpoints.Images> =>
    DockerEngine.build({
        tag: DOCKER_IMAGE_TAG,
        context: MobyConvey.packBuildContextIntoTarballStream(
            HashMap.make(
                Tuple.make("default.pulse-audio", PULSE_AUDIO_BLOB),
                Tuple.make("Dockerfile", DOCKERFILE_BLOB),
                Tuple.make("emulator_access.json", EMULATOR_ACCESS_BLOB),
                Tuple.make("entrypoint.sh", ENTRYPOINT_BLOB),
                Tuple.make("envoy.yaml", ENVOY_BLOB),
                Tuple.make("nginx.conf", NGINX_BLOB)
            )
        ),
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
