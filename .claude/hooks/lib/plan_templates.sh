#!/bin/bash
# Plan Template Library
# Generates pre-configured context plans for common tasks

PROJECT_ROOT="/Users/josefbell/SupaSnake"

# Generate Visual Design Plan Template
generate_visual_design_plan() {
  local output_file="${1:-state/plan_templates/visual_design_template.json}"

  cat > "$output_file" <<'EOF'
{
  "plan_name": "Visual Design Analysis",
  "created_at": "TIMESTAMP_PLACEHOLDER",
  "task_description": "Comprehensive visual design review - aesthetics, UI, game assets, art pipeline",
  "required_context": [
    {
      "file": "knowledge_base/game/quick_ref/aesthetics_pillars.md",
      "reason": "Core visual design principles",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/game/quick_ref/design_philosophy.md",
      "reason": "Overall design philosophy",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/game_design/quick_ref/concept_art_direction.md",
      "reason": "Art direction concepts",
      "type": "quick_ref",
      "priority": 1
    }
  ],
  "optional_context": [
    {
      "file": "knowledge_base/game_design/how_to/design_supasnake_aesthetics.md",
      "reason": "Detailed aesthetic implementation guide",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/how_to/design_variants_as_characters.md",
      "reason": "Character design approach",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/how_to/design_dynasty_worlds.md",
      "reason": "World/environment design",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/reference/batch3_chapters/chapter_23_aesthetics_summary.md",
      "reason": "Comprehensive aesthetics theory",
      "type": "reference",
      "priority": 3
    },
    {
      "file": "design/systems/aesthetics_strategy_v2.md",
      "reason": "Complete art pipeline and dynasty styles",
      "type": "design_doc",
      "priority": 2
    },
    {
      "file": "design/systems/dynasty_system_v2.md",
      "reason": "Dynasty visual identities and color palettes",
      "type": "design_doc",
      "priority": 2
    }
  ],
  "context_budget": "15000 tokens estimated",
  "load_order": "quick_ref → how_to → design_docs → reference (if budget allows)"
}
EOF

  echo "✓ Generated visual design plan template: $output_file" >&2
}

# Generate Hook Development Plan Template
generate_hooks_plan() {
  local output_file="${1:-state/plan_templates/hooks_template.json}"

  cat > "$output_file" <<'EOF'
{
  "plan_name": "Hook Development",
  "created_at": "TIMESTAMP_PLACEHOLDER",
  "task_description": "Creating, testing, or debugging custom PreToolUse/PostToolUse/Stop hooks",
  "required_context": [
    {
      "file": "knowledge_base/platform/quick_ref/hook_types.md",
      "reason": "Hook types overview and when to use each",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/platform/quick_ref/hook_testing.md",
      "reason": "How to test hooks quickly",
      "type": "quick_ref",
      "priority": 1
    }
  ],
  "optional_context": [
    {
      "file": "knowledge_base/platform/how_to/create_custom_hook.md",
      "reason": "Step-by-step hook creation guide",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/platform/reference/hooks_guide_full.md",
      "reason": "Complete hook patterns and advanced topics",
      "type": "reference",
      "priority": 3
    },
    {
      "file": ".claude/hooks/pre-tool-use/01-block-incomplete-code.sh",
      "reason": "Example PreToolUse hook implementation",
      "type": "implementation",
      "priority": 2
    },
    {
      "file": ".claude/hooks/post-tool-use/01-format-and-lint.sh",
      "reason": "Example PostToolUse hook implementation",
      "type": "implementation",
      "priority": 2
    }
  ],
  "context_budget": "8000 tokens estimated",
  "load_order": "quick_ref → implementation_examples → how_to → reference"
}
EOF

  echo "✓ Generated hooks plan template: $output_file" >&2
}

# Generate Context Management Plan Template
generate_context_management_plan() {
  local output_file="${1:-state/plan_templates/context_management_template.json}"

  cat > "$output_file" <<'EOF'
{
  "plan_name": "Context Management",
  "created_at": "TIMESTAMP_PLACEHOLDER",
  "task_description": "Context management decisions - when to /clear, token estimation, active loading",
  "required_context": [
    {
      "file": "knowledge_base/platform/quick_ref/decision_matrix.md",
      "reason": "Core decision framework for context management",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/platform/quick_ref/when_to_clear.md",
      "reason": "Triggers for using /clear proactively",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/platform/quick_ref/token_estimates.md",
      "reason": "Token estimation guidelines",
      "type": "quick_ref",
      "priority": 1
    }
  ],
  "optional_context": [
    {
      "file": "knowledge_base/platform/how_to/apply_decision_matrix.md",
      "reason": "Step-by-step decision matrix application",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/platform/how_to/recover_from_clear.md",
      "reason": "Fast recovery after /clear",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/platform/reference/context_management_full.md",
      "reason": "Complete context management strategy",
      "type": "reference",
      "priority": 3
    }
  ],
  "context_budget": "5000 tokens estimated",
  "load_order": "quick_ref → how_to → reference (if needed)"
}
EOF

  echo "✓ Generated context management plan template: $output_file" >&2
}

# Generate Game Design Plan Template
generate_game_design_plan() {
  local output_file="${1:-state/plan_templates/game_design_template.json}"

  cat > "$output_file" <<'EOF'
{
  "plan_name": "Game Design",
  "created_at": "TIMESTAMP_PLACEHOLDER",
  "task_description": "Game design principles, player psychology, mechanics, balance",
  "required_context": [
    {
      "file": "knowledge_base/game_design/quick_ref/concept_theme.md",
      "reason": "Game theme and unifying principles",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/game_design/quick_ref/concept_elemental_tetrad.md",
      "reason": "Four elements of game design",
      "type": "quick_ref",
      "priority": 1
    },
    {
      "file": "knowledge_base/game_design/quick_ref/concept_player_mental_models.md",
      "reason": "How players think about games",
      "type": "quick_ref",
      "priority": 1
    }
  ],
  "optional_context": [
    {
      "file": "knowledge_base/game_design/how_to/apply_theme_to_supasnake.md",
      "reason": "Theme application to SupaSnake",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/how_to/design_for_mobile_f2p_players.md",
      "reason": "Mobile F2P design patterns",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/how_to/balance_supasnake_mechanics.md",
      "reason": "Mechanics balancing guide",
      "type": "how_to",
      "priority": 2
    },
    {
      "file": "knowledge_base/game_design/reference/batch1_chapters/chapter_01_designer_summary.md",
      "reason": "Designer foundations",
      "type": "reference",
      "priority": 3
    }
  ],
  "context_budget": "10000 tokens estimated",
  "load_order": "quick_ref → how_to → reference (if budget allows)"
}
EOF

  echo "✓ Generated game design plan template: $output_file" >&2
}

# Generate Analytics Plan Template
generate_analytics_plan() {
  local output_file="${1:-state/plan_templates/analytics_template.json}"

  cat > "$output_file" <<'EOF'
{
  "plan_name": "Analytics & Privacy",
  "created_at": "TIMESTAMP_PLACEHOLDER",
  "task_description": "Analytics implementation (Amplitude, Statsig), privacy compliance, tracking strategy",
  "required_context": [
    {
      "file": "src/lib/analytics/amplitude.ts",
      "reason": "Current Amplitude implementation",
      "type": "implementation",
      "priority": 1
    },
    {
      "file": "src/lib/analytics/statsig.ts",
      "reason": "Current Statsig implementation",
      "type": "implementation",
      "priority": 1
    },
    {
      "file": ".env",
      "reason": "Analytics API keys and configuration",
      "type": "config",
      "priority": 1
    }
  ],
  "optional_context": [
    {
      "file": "src/lib/analytics/amplitude.native.ts",
      "reason": "React Native Amplitude implementation",
      "type": "implementation",
      "priority": 2
    },
    {
      "file": "src/lib/analytics/amplitude.web.ts",
      "reason": "Web browser Amplitude implementation",
      "type": "implementation",
      "priority": 2
    },
    {
      "file": "src/lib/analytics/statsig.native.ts",
      "reason": "React Native Statsig implementation",
      "type": "implementation",
      "priority": 2
    },
    {
      "file": "src/lib/analytics/statsig.web.ts",
      "reason": "Web browser Statsig implementation",
      "type": "implementation",
      "priority": 2
    }
  ],
  "context_budget": "6000 tokens estimated",
  "load_order": "main_implementations → platform_specific (if needed)"
}
EOF

  echo "✓ Generated analytics plan template: $output_file" >&2
}

# Instantiate a plan from a template (replaces timestamp, optionally adds custom fields)
instantiate_plan() {
  local template_file="$1"
  local output_file="$2"
  local task_description="${3:-}"

  if [[ ! -f "$template_file" ]]; then
    echo "❌ Template not found: $template_file" >&2
    return 1
  fi

  local timestamp=$(date +%Y%m%d_%H%M%S)

  # Replace timestamp placeholder
  local plan_content=$(cat "$template_file" | sed "s/TIMESTAMP_PLACEHOLDER/$(date -Iseconds)/")

  # If custom task description provided, replace it
  if [[ -n "$task_description" ]]; then
    plan_content=$(echo "$plan_content" | jq --arg desc "$task_description" '.task_description = $desc')
  fi

  echo "$plan_content" > "$output_file"
  echo "✓ Instantiated plan: $output_file" >&2
}

# Generate all templates
generate_all_templates() {
  local template_dir="${1:-state/plan_templates}"

  mkdir -p "$template_dir"

  generate_visual_design_plan "$template_dir/visual_design_template.json"
  generate_hooks_plan "$template_dir/hooks_template.json"
  generate_context_management_plan "$template_dir/context_management_template.json"
  generate_game_design_plan "$template_dir/game_design_template.json"
  generate_analytics_plan "$template_dir/analytics_template.json"

  echo "" >&2
  echo "✅ All 5 plan templates generated in $template_dir" >&2
}
