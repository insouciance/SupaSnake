#!/bin/bash

# Stripe Products Setup Script
# Creates products and prices in Stripe for OG Snake shop
# Run: ./scripts/setup_stripe_products.sh

set -e

# Load env vars
source .env

if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "❌ STRIPE_SECRET_KEY not found in .env"
  exit 1
fi

echo "🚀 Creating Stripe products for OG Snake..."
echo ""

# Function to create product and price
create_product() {
  local id=$1
  local name=$2
  local description=$3
  local price=$4
  local env_var=$5

  echo "Creating: $name ($id)"

  # Create product
  product_response=$(curl -s -X POST https://api.stripe.com/v1/products \
    -u "$STRIPE_SECRET_KEY:" \
    -d "name=$name" \
    -d "description=$description" \
    -d "metadata[og_snake_id]=$id")

  product_id=$(echo "$product_response" | grep -o '"id": "prod_[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$product_id" ]; then
    echo "  ⚠️  Product may already exist, searching..."
    # Try to find existing product
    search_response=$(curl -s -X GET "https://api.stripe.com/v1/products?active=true&limit=100" \
      -u "$STRIPE_SECRET_KEY:")
    product_id=$(echo "$search_response" | grep -o "\"id\": \"prod_[^\"]*\"" | head -1 | cut -d'"' -f4)
  fi

  echo "  📦 Product ID: $product_id"

  # Create price
  price_response=$(curl -s -X POST https://api.stripe.com/v1/prices \
    -u "$STRIPE_SECRET_KEY:" \
    -d "product=$product_id" \
    -d "unit_amount=$price" \
    -d "currency=usd")

  price_id=$(echo "$price_response" | grep -o '"id": "price_[^"]*"' | head -1 | cut -d'"' -f4)

  echo "  💰 Price ID: $price_id"
  echo "  $env_var=$price_id"
  echo ""

  # Store for final output
  echo "$env_var=$price_id" >> /tmp/stripe_env_vars.txt
}

# Clear temp file
> /tmp/stripe_env_vars.txt

# Create all products
create_product "energy_small" "Energy Pack" "3 Energy to fuel your games" 99 "NEXT_PUBLIC_STRIPE_ENERGY_SMALL"
create_product "energy_medium" "Energy Bundle" "10 Energy - Best Value!" 249 "NEXT_PUBLIC_STRIPE_ENERGY_MEDIUM"
create_product "energy_large" "Energy Vault" "25 Energy for serious players" 499 "NEXT_PUBLIC_STRIPE_ENERGY_LARGE"
create_product "starter_bundle" "Starter Bundle" "20 Energy + 1000 DNA + Exclusive EMBER_8 Variant" 299 "NEXT_PUBLIC_STRIPE_STARTER_BUNDLE"
create_product "dynasty_bundle" "Dynasty Booster" "50 Energy + 3000 DNA + Exclusive CRYSTAL_9 Variant" 999 "NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE"

echo "============================================================"
echo "📋 Add these to your .env file:"
echo ""
echo "# Stripe Product Price IDs"
cat /tmp/stripe_env_vars.txt
echo ""
echo "============================================================"
echo ""
echo "✅ Done! Now add the price IDs above to your .env file"
echo "🧪 Test with card: 4242 4242 4242 4242"
