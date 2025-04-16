import * as Rpc from "@effect/rpc/Rpc";
import * as Resolver from "@effect/rpc/RpcResolver";
import * as RpcRouter from "@effect/rpc/RpcRouter";
import * as Effect from "effect/Effect";
import * as RequestResolver from "effect/RequestResolver";
import * as Schema from "effect/Schema";
import * as Frida from "frida";

class testRequest extends Schema.TaggedRequest<testRequest>("testRequest")("testRequest", {
    payload: { a: Schema.String },
    success: Schema.Number,
    failure: Schema.Never,
}) {}

type Router = RpcRouter.RpcRouter<testRequest, never>;

// Lives in the compiled agent
export const router: Router = RpcRouter.make(Rpc.effect(testRequest, ({ a }) => Effect.succeed(a.length)));

// Lives in a library
const make = <Router extends RpcRouter.RpcRouter<any, any>>(
    script: Frida.Script
): RequestResolver.RequestResolver<
    Rpc.Request<RpcRouter.RpcRouter.Request<Router>>,
    Schema.SerializableWithResult.Context<RpcRouter.RpcRouter.Request<Router>>
> =>
    Resolver.make((requests: ReadonlyArray<unknown>) =>
        Effect.gen(function* () {
            const exports = script.exports;
            yield* Effect.void;
            return {} as any;
        })
    )<Router>();

// Lives in the control package
const resolver = make<Router>({} as any);
