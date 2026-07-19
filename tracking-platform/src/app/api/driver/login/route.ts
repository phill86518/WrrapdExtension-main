/**
 * Legacy path: courier Drivers use /api/courier/login.
 * Kept as an alias so older clients still hit the courier registry (not WrapStar).
 */
export { POST } from "../../courier/login/route";
