import { Effect, Option } from "effect";
import { DockerEngine, Endpoints as MobyEndpoints, Schemas as MobySchemas } from "the-moby-effect";
import { containerCreateOptions, type IArchitectPortBindings } from "./0-shared-options.js";

/**
 * Creates a new architect docker container using the shared docker volume
 * populated earlier. This container will not save any state in the shared
 * volume, but it will load a snapshot from it which drastically decreases boot
 * times.
 */
export const buildFreshContainer = ({
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

export default buildFreshContainer;
