#!/bin/bash

# Helper script to set up Auggie authentication from auggie token
# This extracts the accessToken and tenantURL from 'auggie token print'

echo "🔍 Fetching Auggie authentication token..."

# Get the token JSON
TOKEN_OUTPUT=$(auggie token print 2>/dev/null | grep '^TOKEN=' | sed 's/^TOKEN=//')

if [ -z "$TOKEN_OUTPUT" ]; then
  echo "❌ Error: Could not get token from 'auggie token print'"
  echo "   Make sure you're logged in with: auggie login"
  exit 1
fi

# Extract accessToken and tenantURL using grep and sed
ACCESS_TOKEN=$(echo "$TOKEN_OUTPUT" | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"\([^"]*\)"/\1/')
TENANT_URL=$(echo "$TOKEN_OUTPUT" | grep -o '"tenantURL":"[^"]*"' | sed 's/"tenantURL":"\([^"]*\)"/\1/')

if [ -z "$ACCESS_TOKEN" ] || [ -z "$TENANT_URL" ]; then
  echo "❌ Error: Could not parse token information"
  exit 1
fi

echo "✅ Successfully extracted authentication credentials"
echo ""
echo "📝 Add these to your .env file:"
echo ""
echo "AUGMENT_API_TOKEN=$ACCESS_TOKEN"
echo "AUGMENT_API_URL=$TENANT_URL"
echo ""

# Optionally update .env file if it exists
if [ -f ".env" ]; then
  read -p "Would you like to update .env file automatically? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup existing .env
    cp .env .env.backup
    echo "📦 Backed up existing .env to .env.backup"
    
    # Update or add the tokens
    if grep -q "^AUGMENT_API_TOKEN=" .env; then
      sed -i.tmp "s|^AUGMENT_API_TOKEN=.*|AUGMENT_API_TOKEN=$ACCESS_TOKEN|" .env
      rm .env.tmp 2>/dev/null
    else
      echo "AUGMENT_API_TOKEN=$ACCESS_TOKEN" >> .env
    fi
    
    if grep -q "^AUGMENT_API_URL=" .env; then
      sed -i.tmp "s|^AUGMENT_API_URL=.*|AUGMENT_API_URL=$TENANT_URL|" .env
      rm .env.tmp 2>/dev/null
    else
      echo "AUGMENT_API_URL=$TENANT_URL" >> .env
    fi
    
    echo "✅ Updated .env file with new credentials"
  fi
else
  echo "💡 Tip: Copy .env.example to .env first:"
  echo "   cp .env.example .env"
fi

