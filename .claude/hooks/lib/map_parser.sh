#!/bin/bash
# MAP.md Intelligence Library
# Suggests files from knowledge_base/MAP.md based on query keywords

# Function to suggest files for visual design queries
suggest_visual_design_files() {
  cat >&2 <<'EOF'
📚 MAP.md suggests (Visual Design):

  Quick Refs (50-200 words each):
    - knowledge_base/game/quick_ref/aesthetics_pillars.md
    - knowledge_base/game/quick_ref/design_philosophy.md
    - knowledge_base/game_design/quick_ref/concept_art_direction.md
    - knowledge_base/game_design/quick_ref/concept_visual_language.md

  How-Tos (500-1,000 words each):
    - knowledge_base/game_design/how_to/design_supasnake_aesthetics.md
    - knowledge_base/game_design/how_to/design_variants_as_characters.md
    - knowledge_base/game_design/how_to/design_dynasty_worlds.md

  Reference (2,000+ words):
    - knowledge_base/game_design/reference/batch3_chapters/chapter_23_aesthetics_summary.md
EOF
}

# Function to suggest files for hook development
suggest_hook_files() {
  cat >&2 <<'EOF'
📚 MAP.md suggests (Hook Development):

  Quick Refs (50-200 words each):
    - knowledge_base/platform/quick_ref/hook_types.md
    - knowledge_base/platform/quick_ref/hook_testing.md

  How-Tos (500-1,000 words each):
    - knowledge_base/platform/how_to/create_custom_hook.md

  Reference (2,000+ words):
    - knowledge_base/platform/reference/hooks_guide_full.md
EOF
}

# Function to suggest files for context management
suggest_context_files() {
  cat >&2 <<'EOF'
📚 MAP.md suggests (Context Management):

  Quick Refs (50-200 words each):
    - knowledge_base/platform/quick_ref/decision_matrix.md
    - knowledge_base/platform/quick_ref/when_to_clear.md
    - knowledge_base/platform/quick_ref/token_estimates.md

  How-Tos (500-1,000 words each):
    - knowledge_base/platform/how_to/apply_decision_matrix.md
    - knowledge_base/platform/how_to/recover_from_clear.md

  Reference (2,000+ words):
    - knowledge_base/platform/reference/context_management_full.md
EOF
}

# Function to suggest files for game design
suggest_game_design_files() {
  cat >&2 <<'EOF'
📚 MAP.md suggests (Game Design):

  Quick Refs (50-200 words each):
    - knowledge_base/game_design/quick_ref/concept_theme.md
    - knowledge_base/game_design/quick_ref/concept_elemental_tetrad.md
    - knowledge_base/game_design/quick_ref/concept_player_mental_models.md

  How-Tos (500-1,000 words each):
    - knowledge_base/game_design/how_to/apply_theme_to_supasnake.md
    - knowledge_base/game_design/how_to/design_for_mobile_f2p_players.md

  Reference (2,000+ words):
    - knowledge_base/game_design/reference/batch1_chapters/chapter_01_designer_summary.md
EOF
}

# Main function: detect query type and suggest files
suggest_files_for_query() {
  local query="$1"
  local query_lower=$(echo "$query" | tr '[:upper:]' '[:lower:]')

  if [[ "$query_lower" =~ (visual|design|aesthetic|art|ui|ux|style) ]]; then
    suggest_visual_design_files
  elif [[ "$query_lower" =~ (hook|enforce|quality|gate|validate) ]]; then
    suggest_hook_files
  elif [[ "$query_lower" =~ (context|token|clear|load|memory) ]]; then
    suggest_context_files
  elif [[ "$query_lower" =~ (game|player|balance|mechanic|progression) ]]; then
    suggest_game_design_files
  else
    echo "💡 Common query types:" >&2
    echo "  - 'visual design' → aesthetics files" >&2
    echo "  - 'hooks' → hook development files" >&2
    echo "  - 'context' → context management files" >&2
    echo "  - 'game design' → Schell extraction files" >&2
    echo "" >&2
    echo "See @knowledge_base/MAP.md for full query index" >&2
  fi
}
