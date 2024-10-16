import { Socket } from "@effect/platform";
import { ParseResult } from "@effect/schema";
import { Effect, Schedule } from "effect";
import { Endpoints as MobyEndpoints, Schemas as MobySchemas } from "the-moby-effect";

import { IArchitectPortBindings } from "./0-shared-options.js";
import { buildImage } from "./1-build-image.js";
import { populateSharedDataVolume } from "./2-populate-emulator-data-volume.js";
import { buildFreshContainer } from "./3-create-emulator-container.js";
import { getExposedEmulatorEndpoints, IExposedArchitectEndpoints } from "./4-exposed-container-endpoints.js";
import { installApk } from "./5-container-helpers.js";

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
        MobyEndpoints.Containers | MobyEndpoints.Execs
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
    | Error,
    MobyEndpoints.Images | MobyEndpoints.Volumes | MobyEndpoints.Containers
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
