import { Path, Error as PlatformError, Socket } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { ParseResult } from "@effect/schema";
import { Effect, Option, Schedule, Stream } from "effect";
import {
    DockerEngine,
    Convey as MobyConvey,
    Endpoints as MobyEndpoints,
    Schemas as MobySchemas,
} from "the-moby-effect";

import {
    ANDROID_SDK_TOOLS_VERSION,
    DOCKER_IMAGE_TAG,
    EMULATOR_SYSTEM_IMAGE_VERSION,
    EMULATOR_SYSTEM_IMAGE_VERSION_SHORT,
    EMULATOR_VERSION,
    ENVOY_PROXY_VERSION,
    FRIDA_SERVER_VERSION,
    MITM_PROXY_VERSION,
    SHARED_EMULATOR_DATA_VOLUME_NAME,
    SHARED_VOLUME_CONTAINER_HELPER_NAME,
} from "./versions.js";

/** The port bindings that all architect emulator containers must have. */
interface IArchitectPortBindings {
    /** Adb console port */
    "5554/tcp": readonly [{ HostPort: string }];

    /** Adb port */
    "5555/tcp": readonly [{ HostPort: string }];

    /** Mitmproxy web interface port */
    "8080/tcp": readonly [{ HostPort: string }];

    /** Envoy proxy admin web interface port */
    "8081/tcp": readonly [{ HostPort: string }];

    /** Emulator grpc port */
    "8554/tcp": readonly [{ HostPort: string }];

    /** Emulator grpc web port */
    "8555/tcp": readonly [{ HostPort: string }];

    /** Frida server port */
    "27042/tcp": readonly [{ HostPort: string }];
}

/**
 * Specifies the docker options for creating an architect container. You must
 * provide a name for the container and you can optionally provide the
 * entrypoint command, network mode, port bindings, and environment variables.
 *
 * @internal
 */
const containerCreateOptions = ({
    containerName,
    command,
    networkMode,
    portBindings,
    environmentVariables,
}: {
    containerName: string;
    environmentVariables: string[];
    command: Option.Option<string[]>;
    networkMode?: "default" | "none" | "host" | "bridge" | "nat" | undefined;
    portBindings: Partial<IArchitectPortBindings>;
}): { name: string; spec: typeof MobySchemas.ContainerCreateRequest.Encoded } => ({
    name: containerName,
    spec: {
        Image: DOCKER_IMAGE_TAG,
        Cmd: Option.getOrNull(command),
        Volumes: { "/android/avd-home/Pixel2.avd/": {} },
        Env: environmentVariables.some((environmentVariable) => environmentVariable.startsWith("DISPLAY="))
            ? environmentVariables
            : ["DISPLAY=:1", ...environmentVariables],
        HostConfig: {
            NetworkMode: networkMode,
            DeviceRequests: [{ Count: -1, Driver: "nvidia", Capabilities: [["gpu"]], DeviceIDs: null, Options: null }],
            // Devices: [{ CgroupPermissions: "mrw", PathInContainer: "/dev/kvm", PathOnHost: "/dev/kvm" }],
            PortBindings: portBindings,
            Binds: [
                "/tmp/.X11-unix:/tmp/.X11-unix",
                "/etc/timezone:/etc/timezone:ro",
                "/etc/localtime:/etc/localtime:ro",
                // "/usr/share/vulkan/icd.d/nvidia_icd.json:/usr/share/vulkan/icd.d/nvidia_icd.json",
                // "/usr/share/glvnd/egl_vendor.d/10_nvidia.json:/usr/share/glvnd/egl_vendor.d/10_nvidia.json",
                // "/usr/share/vulkan/implicit_layer.d/nvidia_layers.json:/usr/share/vulkan/implicit_layer.d/nvidia_layers.json",
                `${SHARED_EMULATOR_DATA_VOLUME_NAME}:/android/avd-home/Pixel2.avd/`,
            ],
        },
    },
});

/** Build arguments that must be provided for the architect docker image */
interface IArchitectDockerImageBuildArguments {
    ["EMULATOR_VERSION"]: string;
    ["MITM_PROXY_VERSION"]: string;
    ["ENVOY_PROXY_VERSION"]: string;
    ["FRIDA_SERVER_VERSION"]: string;
    ["ANDROID_SDK_TOOLS_VERSION"]: string;
    ["EMULATOR_SYSTEM_IMAGE_VERSION"]: string;
    ["EMULATOR_SYSTEM_IMAGE_VERSION_SHORT"]: string;
}

/** @internal */
const buildImage = (): Effect.Effect<
    void,
    MobyEndpoints.ImagesError | PlatformError.PlatformError,
    MobyEndpoints.Images | Path.Path
> =>
    Effect.gen(function* () {
        const path = yield* Path.Path;
        const context = yield* path.fromFileUrl(new URL("../emulator", import.meta.url));
        const contextStream = MobyConvey.packBuildContextIntoTarballStream(context, [
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

/**
 * If the architect emulator shared volume does not exists on the docker host,
 * then this will create a new docker volume and run the architect docker image
 * to populate the shared volume then return it. If it finds a container already
 * populating the shared volume then it will wait until that container exists.
 * If the shared volume already exists and there is no container populating it,
 * then it returns immediately because there is no work to do.
 *
 * @internal
 */
const populateSharedDataVolume = (): Effect.Effect<
    Readonly<MobySchemas.Volume>,
    MobyEndpoints.VolumesError | MobyEndpoints.ContainersError | Error,
    MobyEndpoints.Volumes | MobyEndpoints.Containers
> =>
    Effect.gen(function* () {
        const volumes: MobyEndpoints.Volumes = yield* MobyEndpoints.Volumes;
        const containers: MobyEndpoints.Containers = yield* MobyEndpoints.Containers;
        yield* Effect.logInfo("Populating shared emulator data volume...");

        // Wait for any existing containers to be gone
        yield* Effect.retry(
            Effect.gen(function* () {
                const anyContainers: MobySchemas.VolumeListResponse = yield* volumes.list({
                    filters: { name: [SHARED_VOLUME_CONTAINER_HELPER_NAME] },
                });

                if (anyContainers.Volumes && anyContainers.Volumes?.length > 0) {
                    yield* Effect.fail(new Error("Helper containers still existed after timeout"));
                }
            }),
            Schedule.addDelay(Schedule.recurs(60), () => 5000)
        );

        // Check for the existing emulator data volume
        const maybeVolume: MobySchemas.VolumeListResponse = yield* volumes.list({
            filters: { name: [SHARED_EMULATOR_DATA_VOLUME_NAME] },
        });

        // If the volume exists then we do not have to repopulate it
        if (maybeVolume.Volumes && maybeVolume.Volumes[0]) {
            const volume: MobySchemas.Volume = maybeVolume.Volumes[0];
            yield* Effect.log(`Volume ${volume.Name} already existed, so no work needed to be done`);
            return volume;
        }

        // Create the helper container and run the make-snapshot.sh script
        const volume: Readonly<MobySchemas.Volume> = yield* volumes.create({
            Driver: "local",
            Name: SHARED_EMULATOR_DATA_VOLUME_NAME,
        });
        const createOptions = containerCreateOptions({
            portBindings: {},
            networkMode: undefined,
            environmentVariables: [],
            containerName: SHARED_VOLUME_CONTAINER_HELPER_NAME,
            command: Option.some(["/android/sdk/make-snapshot.sh"]),
        });

        const volumeHelperContainer: MobySchemas.ContainerCreateResponse = yield* containers.create(createOptions);
        yield* containers.start({ id: volumeHelperContainer.Id });

        // Wait for the container to exit and handle errors
        const exitCode: MobySchemas.ContainerWaitResponse = yield* containers.wait({
            id: volumeHelperContainer.Id,
        });

        if (exitCode.StatusCode !== 0) {
            yield* containers.delete({ id: volumeHelperContainer.Id });
            yield* volumes.delete({ name: volume.Name, force: true });
            return yield* Effect.fail(new Error("An error ocurred when populating the shared emulator data volume"));
        }

        yield* Effect.logInfo("Shared emulator data volume population complete");
        yield* containers.delete({ id: volumeHelperContainer.Id });
        return volume;
    });

/**
 * Creates a new architect docker container using the shared docker volume
 * populated earlier. This container will not save any state in the shared
 * volume, but it will load a snapshot from it which drastically decreases boot
 * times.
 *
 * @internal
 */
const buildFreshContainer = ({
    containerName,
    networkMode,
    portBindings,
    environmentVariables,
}: {
    containerName: string;
    environmentVariables: string[];
    networkMode: "default" | "none" | "host" | "bridge" | "nat" | undefined;
    portBindings: Partial<IArchitectPortBindings>;
}): Effect.Effect<MobySchemas.ContainerInspectResponse, MobyEndpoints.ContainersError, MobyEndpoints.Containers> => {
    // Merge port bindings, 0 means pick a random unused port
    const PortBindings: IArchitectPortBindings = Object.assign(
        {},
        {
            "5554/tcp": [{ HostPort: "0" }],
            "5555/tcp": [{ HostPort: "0" }],
            "8080/tcp": [{ HostPort: "0" }],
            "8081/tcp": [{ HostPort: "0" }],
            "8554/tcp": [{ HostPort: "0" }],
            "8555/tcp": [{ HostPort: "0" }],
            "27042/tcp": [{ HostPort: "0" }],
        } satisfies IArchitectPortBindings,
        portBindings
    );

    const containerOptions: { name: string; spec: typeof MobySchemas.ContainerCreateRequest.Encoded } =
        containerCreateOptions({
            networkMode,
            containerName,
            environmentVariables,
            command: Option.none(),
            portBindings: PortBindings,
        });

    return DockerEngine.run(containerOptions);
};

/** The endpoints that an architect container has. */
interface IArchitectEndpoints {
    dockerHostAddress: string;
    emulatorContainerAddress: string | undefined;
    adbConsoleAddress: string;
    adbAddress: string;
    grpcAddress: string;
    fridaAddress: string;
    envoyAdminAddress: string;
    envoyGrpcWebAddress: string;
    mitmWebInterfaceAddress: string;
}

type IExposedArchitectEndpoints =
    | [usingHostNetworking: IArchitectEndpoints]
    | [usingHostNetworking: IArchitectEndpoints, usingContainersIPv4Networking: IArchitectEndpoints];

/**
 * Retrieves all the endpoints exposed by the container. If the endpoints are
 * meant to be consumed in a browser, they will be prefixed with "http" or
 * "https" appropriately. Application endpoints will have no prefix.
 *
 * @internal
 */
const getExposedEmulatorEndpoints = ({
    dockerHostAddress,
    emulatorContainer,
}: {
    dockerHostAddress: string;
    emulatorContainer: MobySchemas.ContainerInspectResponse;
}): Effect.Effect<IExposedArchitectEndpoints, never, never> =>
    Effect.gen(function* () {
        const emulatorContainerAddress: string | undefined = emulatorContainer.NetworkSettings?.IPAddress || undefined;

        // This is the port bindings the emulator container exposes
        const exposedEmulatorContainerPorts: IArchitectPortBindings =
            emulatorContainer.HostConfig?.NetworkMode === "host"
                ? ({
                      "5554/tcp": [{ HostPort: "5554" }],
                      "5555/tcp": [{ HostPort: "5555" }],
                      "8080/tcp": [{ HostPort: "8080" }],
                      "8081/tcp": [{ HostPort: "8081" }],
                      "8554/tcp": [{ HostPort: "8554" }],
                      "8555/tcp": [{ HostPort: "8555" }],
                      "27042/tcp": [{ HostPort: "27042" }],
                  } satisfies IArchitectPortBindings)
                : (emulatorContainer.NetworkSettings?.Ports as unknown as IArchitectPortBindings);

        // How to reach these endpoints over the docker host's networking
        const exposedEndpointsUsingHostsNetworking: IArchitectEndpoints = {
            dockerHostAddress,
            emulatorContainerAddress,
            adbConsoleAddress: `${dockerHostAddress}:${exposedEmulatorContainerPorts["5554/tcp"][0].HostPort}`,
            adbAddress: `${dockerHostAddress}:${exposedEmulatorContainerPorts["5555/tcp"][0].HostPort}`,
            mitmWebInterfaceAddress: `http://${dockerHostAddress}:${exposedEmulatorContainerPorts["8080/tcp"][0].HostPort}`,
            envoyAdminAddress: `http://${dockerHostAddress}:${exposedEmulatorContainerPorts["8081/tcp"][0].HostPort}`,
            grpcAddress: `${dockerHostAddress}:${exposedEmulatorContainerPorts["8554/tcp"][0].HostPort}`,
            envoyGrpcWebAddress: `http://${dockerHostAddress}:${exposedEmulatorContainerPorts["8555/tcp"][0].HostPort}`,
            fridaAddress: `${dockerHostAddress}:${exposedEmulatorContainerPorts["27042/tcp"][0].HostPort}`,
        };

        // How to reach these endpoints over the docker container's networking
        const exposedEndpointsUsingContainersNetworking: IArchitectEndpoints = {
            dockerHostAddress,
            emulatorContainerAddress,
            adbConsoleAddress: `${emulatorContainerAddress}:${exposedEmulatorContainerPorts["5554/tcp"][0].HostPort}`,
            adbAddress: `${emulatorContainerAddress}:${exposedEmulatorContainerPorts["5555/tcp"][0].HostPort}`,
            mitmWebInterfaceAddress: `http://${emulatorContainerAddress}:${exposedEmulatorContainerPorts["8080/tcp"][0].HostPort}`,
            envoyAdminAddress: `http://${emulatorContainerAddress}:${exposedEmulatorContainerPorts["8081/tcp"][0].HostPort}`,
            grpcAddress: `${emulatorContainerAddress}:${exposedEmulatorContainerPorts["8554/tcp"][0].HostPort}`,
            envoyGrpcWebAddress: `http://${emulatorContainerAddress}:${exposedEmulatorContainerPorts["8555/tcp"][0].HostPort}`,
            fridaAddress: `${emulatorContainerAddress}:${exposedEmulatorContainerPorts["27042/tcp"][0].HostPort}`,
        };

        /**
         * If the container is using host networking, only provide endpoints
         * accessible over the docker host's networking. Otherwise provide both
         * endpoints accessible over the docker host's networking and the docker
         * container's networking.
         */
        const endpointsToReturn: IExposedArchitectEndpoints =
            emulatorContainer.HostConfig?.NetworkMode === "host"
                ? [exposedEndpointsUsingHostsNetworking]
                : [exposedEndpointsUsingHostsNetworking, exposedEndpointsUsingContainersNetworking];

        yield* Effect.log(`Host networking container endpoints are: ${JSON.stringify(endpointsToReturn[0])}`);
        yield* Effect.log(`Container ipv4 networking endpoints are: ${JSON.stringify(endpointsToReturn[1])}`);
        return endpointsToReturn;
    });

/**
 * Given the path to an apk, will install it on the android emulator. Will
 * replace the existing application (if present), will downgrade the version (if
 * supplied a lower version of the application), allows tests packages and will
 * grant all runtime permissions by default.
 *
 * @internal
 */
const installApkCommand = (apkLocation: string): string[] => [
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
 *
 * @internal
 */
const installApk = ({
    apk,
    containerId,
}: {
    apk: string;
    containerId: string;
}): Effect.Effect<
    void,
    Socket.SocketError | MobyEndpoints.ExecsError | MobyEndpoints.ContainersError | ParseResult.ParseError,
    MobyEndpoints.Execs | MobyEndpoints.Containers | Path.Path
> =>
    Effect.gen(function* () {
        const path = yield* Path.Path;
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

interface IArchitectOptions {
    environmentVariables?: string[] | undefined;
    portBindings?: Partial<IArchitectPortBindings> | undefined;
    networkMode?: "default" | "none" | "host" | "bridge" | "nat" | undefined;
}

interface IArchitectReturnType {
    sharedVolume: MobySchemas.Volume;
    containerEndpoints: IExposedArchitectEndpoints;
    emulatorContainer: MobySchemas.ContainerInspectResponse;
    installApk: (
        apk: string
    ) => Effect.Effect<
        void,
        MobyEndpoints.ContainersError | Socket.SocketError | MobyEndpoints.ExecsError | ParseResult.ParseError,
        MobyEndpoints.Containers | MobyEndpoints.Execs | Path.Path
    >;
}

export const architect = (
    options?: IArchitectOptions | undefined
): Effect.Effect<
    IArchitectReturnType,
    | MobyEndpoints.ImagesError
    | MobyEndpoints.VolumesError
    | MobyEndpoints.ContainersError
    | ParseResult.ParseError
    | PlatformError.PlatformError
    | Error,
    MobyEndpoints.Images | MobyEndpoints.Volumes | MobyEndpoints.Containers | Path.Path
> =>
    Effect.gen(function* () {
        // Generate a random container name which will be architectXXXXXX
        const containerName: string = `architect${Math.floor(Math.random() * (999_999 - 100_000 + 1)) + 100_000}`;

        yield* buildImage();

        const sharedVolume: Readonly<MobySchemas.Volume> = yield* populateSharedDataVolume();

        const emulatorContainer: Readonly<MobySchemas.ContainerInspectResponse> = yield* buildFreshContainer({
            containerName,
            networkMode: options?.networkMode,
            portBindings: options?.portBindings || {},
            environmentVariables: options?.environmentVariables || [],
        });

        const containerEndpoints = yield* getExposedEmulatorEndpoints({ emulatorContainer, dockerHostAddress: "" });

        return {
            sharedVolume,
            emulatorContainer,
            containerEndpoints: containerEndpoints,
            installApk: (apk: string) =>
                installApk({ apk, containerId: emulatorContainer.Id }).pipe(
                    Effect.retry({ schedule: Schedule.recurs(3).pipe(Schedule.addDelay(() => "5 seconds")) })
                ),
        };
    });

export const cleanup = (options: {
    sharedVolume?: MobySchemas.Volume | undefined;
    emulatorContainer: MobySchemas.ContainerInspectResponse;
}): Effect.Effect<
    void,
    MobyEndpoints.ContainersError | MobyEndpoints.VolumesError,
    MobyEndpoints.Containers | MobyEndpoints.Volumes
> =>
    Effect.gen(function* () {
        const volumes: MobyEndpoints.Volumes = yield* MobyEndpoints.Volumes;
        const containers: MobyEndpoints.Containers = yield* MobyEndpoints.Containers;

        yield* containers.kill({ id: options.emulatorContainer.Id });
        yield* containers.delete({ id: options.emulatorContainer.Id, force: true, v: true });
        if (options.sharedVolume) yield* volumes.delete({ name: options.sharedVolume.Name });
    });
