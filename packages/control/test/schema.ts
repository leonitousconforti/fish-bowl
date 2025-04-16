import { Rpc } from "@effect/rpc";
import { Function, Schema } from "effect";

export const UserId = Function.pipe(Schema.Number, Schema.int(), Schema.brand("UserId"));
export type UserId = Schema.Schema.Type<typeof UserId>;

export class User extends Schema.Class<User>("User")({
    id: UserId,
    name: Schema.String,
}) {}

export class GetUserIds extends Rpc.StreamRequest<GetUserIds>()("GetUserIds", {
    failure: Schema.Never,
    success: UserId,
    payload: {},
}) {}

export class GetUser extends Schema.TaggedRequest<GetUser>()("GetUser", {
    failure: Schema.Never,
    success: User,
    payload: { id: UserId },
}) {}
