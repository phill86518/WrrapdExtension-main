-- Optional Cloud SQL (e.g. GCP project wrrapd-logins) — mirrors checkoutInvoice.complete from process-payment.
-- wrrapd-server can be extended to upsert here after successful Stripe confirmation.

CREATE TABLE IF NOT EXISTS wrrapd_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number TEXT NOT NULL,
    wrrapd_customer_id TEXT,
    customer_email_norm TEXT,
    claimed_wp_user_id TEXT,
    stripe_payment_intent_id TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    tax_rate_percent NUMERIC(6, 3) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    estimated_tax NUMERIC(12, 2) NOT NULL,
    order_total NUMERIC(12, 2) NOT NULL,
    price_gift_wrap_base NUMERIC(12, 2),
    price_custom_design_ai NUMERIC(12, 2),
    price_custom_design_upload NUMERIC(12, 2),
    price_flowers NUMERIC(12, 2),
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    order_items_json JSONB,
    UNIQUE (order_number)
);

CREATE TABLE IF NOT EXISTS wrrapd_order_aggregate_lines (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES wrrapd_orders (id) ON DELETE CASCADE,
    line_code TEXT NOT NULL,
    label TEXT,
    quantity INTEGER,
    unit_price NUMERIC(12, 2),
    amount NUMERIC(12, 2) NOT NULL,
    UNIQUE (order_id, line_code)
);

CREATE TABLE IF NOT EXISTS wrrapd_order_option_lines (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES wrrapd_orders (id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    asin TEXT,
    product_title TEXT,
    checkbox_wrrapd BOOLEAN NOT NULL DEFAULT FALSE,
    selected_wrapping_option TEXT,
    checkbox_flowers BOOLEAN NOT NULL DEFAULT FALSE,
    gift_wrap_base NUMERIC(12, 2) NOT NULL DEFAULT 0,
    custom_design_ai NUMERIC(12, 2) NOT NULL DEFAULT 0,
    custom_design_upload NUMERIC(12, 2) NOT NULL DEFAULT 0,
    flowers NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wrrapd_orders_email_norm ON wrrapd_orders (customer_email_norm);
CREATE INDEX IF NOT EXISTS idx_wrrapd_orders_wp_user ON wrrapd_orders (claimed_wp_user_id);
