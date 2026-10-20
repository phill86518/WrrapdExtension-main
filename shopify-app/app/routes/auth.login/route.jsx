import { useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const errors = login ? await login(request) : {};
  return { errors };
};

export const action = async ({ request }) => {
  const errors = await login(request);
  return { errors };
};

export default function AuthLogin() {
  const { errors } = useLoaderData();
  return (
    <div style={{ fontFamily: "Fraunces, Georgia, serif", padding: "2rem" }}>
      <h1>Log in — Wrrapd Inc.</h1>
      {errors?.shop ? <p>{errors.shop}</p> : null}
      <form method="post">
        <label>
          Shop domain
          <input name="shop" type="text" placeholder="your-store.myshopify.com" />
        </label>
        <button type="submit">Continue</button>
      </form>
      <p>
        Support: <a href="mailto:help@wrrapd.com">help@wrrapd.com</a>
      </p>
    </div>
  );
}
