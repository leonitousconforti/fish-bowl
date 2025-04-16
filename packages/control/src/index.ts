import { HttpClientError, Socket } from "@effect/platform";
import { Effect, Function, HashMap, ParseResult, Scope, Stream, String, Tuple } from "effect";
import { DockerEngine, MobyConvey, MobyEndpoints, MobySchemas } from "the-moby-effect";

import { downloadApk } from "@shocae/apk-downloader/Download";
import { ApksupportScrapingError } from "@shocae/apk-downloader/Error";
import {
    DOCKERFILE_BLOB,
    EMULATOR_ACCESS_BLOB,
    ENTRYPOINT_BLOB,
    ENVOY_BLOB,
    NGINX_BLOB,
    PULSE_AUDIO_BLOB,
} from "@shocae/emulator/blobs";

const DOCKER_IMAGE_TAG = "shocae:latest";

export const buildImage = (): Stream.Stream<MobySchemas.JSONMessage, MobyEndpoints.ImagesError, MobyEndpoints.Images> =>
    DockerEngine.build({
        tag: DOCKER_IMAGE_TAG,
        context: MobyConvey.packIntoTarballStream(
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

export const architect = (): Effect.Effect<
    {
        containerName: string;
        ports: {
            console: string;
            adb: string;
            mitmWeb: string;
            envoyAdmin: string;
            grpc: string;
            webGrpc: string;
            frida: string;
        };
        installApk: (
            bundleIdentifier: string,
            version?: `${number}.${number}.${number}` | "latest version" | `${number} versions before latest`
        ) => Effect.Effect<
            void,
            | MobyEndpoints.ContainersError
            | MobyEndpoints.ExecsError
            | ParseResult.ParseError
            | Socket.SocketError
            | HttpClientError.HttpClientError
            | ApksupportScrapingError,
            never
        >;
    },
    MobyEndpoints.ContainersError,
    MobyEndpoints.Execs | MobyEndpoints.Containers | Scope.Scope
> =>
    Effect.gen(function* () {
        const execs = yield* MobyEndpoints.Execs;
        const containers = yield* MobyEndpoints.Containers;

        const {
            Id: containerId,
            Name: containerName,
            NetworkSettings: networkSettings,
        } = yield* DockerEngine.runScoped({
            name: `shocae${Math.floor(Math.random() * (999_999 - 100_000 + 1)) + 100_000}`,
            spec: {
                Image: DOCKER_IMAGE_TAG,
                Env: ["DISPLAY=:0"],
                HostConfig: {
                    DeviceRequests: [
                        {
                            Count: -1,
                            Driver: "nvidia",
                            Capabilities: [["gpu"]],
                            DeviceIDs: null,
                            Options: null,
                        },
                    ],
                    Devices: [
                        {
                            CgroupPermissions: "mrw",
                            PathInContainer: "/dev/kvm",
                            PathOnHost: "/dev/kvm",
                        },
                    ],
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
        });

        yield* Function.pipe(
            containers.logs(containerId, { follow: true, stdout: true, stderr: true }),
            Stream.takeUntil(String.includes("Boot completed")),
            Stream.runDrain,
            Effect.andThen(Effect.sleep("5 seconds"))
        );

        const ports = {
            console: networkSettings?.Ports?.["5554/tcp"]?.[0]?.HostPort ?? "",
            adb: networkSettings?.Ports?.["5555/tcp"]?.[0]?.HostPort ?? "",
            mitmWeb: networkSettings?.Ports?.["8080/tcp"]?.[0]?.HostPort ?? "",
            envoyAdmin: networkSettings?.Ports?.["8081/tcp"]?.[0]?.HostPort ?? "",
            grpc: networkSettings?.Ports?.["8554/tcp"]?.[0]?.HostPort ?? "",
            webGrpc: networkSettings?.Ports?.["8555/tcp"]?.[0]?.HostPort ?? "",
            frida: networkSettings?.Ports?.["27042/tcp"]?.[0]?.HostPort ?? "",
        };

        const installApk = (
            bundleIdentifier: string,
            version?: `${number}.${number}.${number}` | "latest version" | `${number} versions before latest`
        ): Effect.Effect<
            void,
            | MobyEndpoints.ContainersError
            | MobyEndpoints.ExecsError
            | ParseResult.ParseError
            | Socket.SocketError
            | HttpClientError.HttpClientError
            | ApksupportScrapingError,
            never
        > =>
            Effect.gen(function* () {
                const parts = yield* downloadApk(bundleIdentifier, version);
                for (const part of parts) {
                    const [_, stream] = yield* part.contents;
                    yield* containers.putArchive(containerId, { path: `/${bundleIdentifier}`, stream });
                }

                const output = yield* DockerEngine.exec({
                    containerId,
                    command: [
                        "adb",
                        "install-multiple",
                        "-r", // Replace existing application (if present)
                        "-t", // Allow test packages
                        "-g", // Grant all runtime permissions
                        "-d", // Allow downgrade
                        `${parts.map(({ part }) => `/${bundleIdentifier}/${part}`).join(" ")}`,
                    ],
                });

                if (!output.includes("Success")) {
                    yield* new MobyEndpoints.ExecsError({
                        method: "installApk",
                        cause: new Error(`Failed to install apk: ${output}`),
                    });
                }
            })
                .pipe(Effect.provideService(MobyEndpoints.Execs, execs))
                .pipe(Effect.scoped);

        return { containerName, ports, installApk };
    });
