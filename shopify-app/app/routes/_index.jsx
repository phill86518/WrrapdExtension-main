import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Landing() {
  const { showForm } = useLoaderData();
  return (
    <div style={{ fontFamily: "Fraunces, Georgia, serif", padding: "2rem", maxWidth: 480 }}>
      <h1>Wrrapd Gift Wrap & Delivery</h1>
      <p>By Wrrapd Inc. · Support: help@wrrapd.com</p>
      {showForm ? (
        <Form method="post" action="/auth/login">
          <label>
            Shop domain
            <input type="text" name="shop" placeholder="your-store.myshopify.com" />
          </label>
          <button type="submit">Log in</button>
        </Form>
      ) : null}
    </div>
  );
}
