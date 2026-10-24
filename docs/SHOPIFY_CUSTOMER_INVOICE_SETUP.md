# REIHH Shopify Order and Invoice Setup

## Required environment

Set these variables on the FastAPI host:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=...
SHOPIFY_WEBHOOK_SECRET=...
PUBLIC_API_BASE_URL=https://your-api.example.com
```

The custom Shopify app needs `read_products`, `read_inventory`, `read_customers`, `read_orders`, and `write_orders` scopes. Shopify may require separate approval for `read_all_orders` to backfill orders older than 60 days. Keep credentials only on the API host; never put the Admin API token in Vercel frontend variables.

Set Vercel `VITE_API_URL` to `https://your-api.example.com/api`. Set backend `CORS_ORIGINS` to the deployed Vercel origin.

## Shopify webhooks

Register HTTPS webhooks at:

```text
https://your-api.example.com/api/integrations/shopify/webhooks
```

Topics: `products/create`, `products/update`, `products/delete`, `customers/create`, `customers/update`, `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`, `fulfillments/create`, `fulfillments/update`, `inventory_levels/update`, and `refunds/create`.

Shopify inventory is authoritative at checkout. Sync the catalog once from BizAI before enabling order webhooks so every Shopify variant maps to a BizAI SKU. After that, webhooks keep the catalog, inventory, customers, orders, fulfillment, refunds, and invoices connected. Repeated deliveries are deduplicated.

## Show invoice links to customers

After a Shopify order webhook creates the invoice, BizAI publishes its customer-safe PDF URL to the Shopify order metafield `bizai.invoice_url`. Add this Liquid block to the customer order details/status template in the REIHH theme:

```liquid
{% assign invoice_url = order.metafields.bizai.invoice_url.value %}
{% if invoice_url != blank %}
  <a href="{{ invoice_url | escape }}" target="_blank" rel="noopener">
    Download invoice
  </a>
{% endif %}
```

Place it in the order details section visible to the signed-in customer. The URL uses a random high-entropy token and the PDF endpoint is served by BizAI; cancelled invoices are not available. The theme change is a one-time storefront setup. Once configured, order and invoice handling runs from the Shopify webhook flow.

## Delivery map updates

Set `DELIVERY_WEBHOOK_SECRET` on the API host. Configure the courier provider to POST JSON location updates to:

```text
https://your-api.example.com/api/integrations/delivery/location
```

Include `X-Delivery-Event-Id` and `X-BizAI-Signature`, where the signature is base64 HMAC-SHA256 of the raw JSON request body using `DELIVERY_WEBHOOK_SECRET`. The payload requires `shopify_order_id` or `order_number`, `latitude`, `longitude`, and may include `status` (`in_transit`, `out_for_delivery`, or `delivered`), `carrier`, `tracking_number`, and `tracking_url`.
