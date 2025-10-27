#!/usr/bin/env python3
"""
Simple API Connection Test
Tests basic connectivity to Anthropic API with memory tool
"""

import os
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Load .env file
def load_env_file():
    """Load environment variables from .env file"""
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip().strip('"').strip("'")
                    os.environ[key] = value
        print(f"✓ Loaded environment from {env_path}", flush=True)

load_env_file()

try:
    import anthropic
    print("✓ Anthropic SDK imported", flush=True)
except ImportError:
    print("❌ Please install anthropic: pip install anthropic", flush=True)
    sys.exit(1)

from memory_tool_handler import MemoryToolHandler


def test_api_connection():
    """Test basic API connectivity"""

    print("\n" + "="*60, flush=True)
    print("API Connection Test", flush=True)
    print("="*60 + "\n", flush=True)

    # Check API key
    print("1. Checking API key...", flush=True)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set", flush=True)
        return False
    print(f"✓ API key found ({api_key[:10]}...)", flush=True)

    # Initialize client
    print("\n2. Initializing Anthropic client...", flush=True)
    try:
        client = anthropic.Anthropic(
            api_key=api_key,
            default_headers={
                "anthropic-beta": "context-management-2025-06-27"
            }
        )
        print("✓ Client initialized with beta header", flush=True)
    except Exception as e:
        print(f"❌ Client initialization failed: {e}", flush=True)
        return False

    # Initialize memory handler
    print("\n3. Initializing memory handler...", flush=True)
    try:
        memory = MemoryToolHandler(base_path="./memories")
        print("✓ Memory handler initialized", flush=True)
    except Exception as e:
        print(f"❌ Memory handler failed: {e}", flush=True)
        return False

    # Test simple API call
    print("\n4. Testing API call (simple message)...", flush=True)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=100,
            messages=[{
                "role": "user",
                "content": "Say 'Hello from the API test' and nothing else."
            }]
        )
        print(f"✓ API call successful", flush=True)
        print(f"   Response: {response.content[0].text}", flush=True)
        print(f"   Tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out", flush=True)
    except Exception as e:
        print(f"❌ API call failed: {e}", flush=True)
        return False

    # Test with memory tool
    print("\n5. Testing API call with memory tool...", flush=True)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": "You have access to a memory tool. Respond with 'I can use the memory tool' and explain what it does in one sentence."
            }],
            tools=[{
                "type": "memory_20250818",
                "name": "memory",
            }]
        )
        print(f"✓ API call with memory tool successful", flush=True)

        for block in response.content:
            if block.type == "text":
                print(f"   Response: {block.text}", flush=True)

        print(f"   Tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out", flush=True)
    except Exception as e:
        print(f"❌ API call with memory tool failed: {e}", flush=True)
        return False

    print("\n" + "="*60, flush=True)
    print("✅ All API tests passed!", flush=True)
    print("="*60, flush=True)

    print("\n📊 Summary:", flush=True)
    print("   ✅ API key configured", flush=True)
    print("   ✅ Client initialized", flush=True)
    print("   ✅ Memory handler operational", flush=True)
    print("   ✅ Simple API call works", flush=True)
    print("   ✅ Memory tool API call works", flush=True)

    print("\n✨ Ready for full POC demonstration!", flush=True)
    return True


if __name__ == "__main__":
    try:
        success = test_api_connection()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
