#!/usr/bin/env python3
"""
Extract patterns from documentation files (specs, decisions, constraints)
Automatically captures architectural knowledge to memory
"""

import sys
import re
import argparse
from pathlib import Path
from datetime import datetime

# Load environment variables for Supabase
from dotenv import load_dotenv
load_dotenv()

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from memory_tool_handler import MemoryToolHandler
except ImportError:
    print("Error: memory_tool_handler not found", file=sys.stderr)
    sys.exit(1)


class DocPatternExtractor:
    """Extract patterns from documentation files"""

    # Keywords indicating important content
    DECISION_KEYWORDS = [
        'decision', 'decided', 'chosen', 'selected', 'approach',
        'rationale', 'why', 'because', 'therefore', 'conclusion'
    ]

    CONSTRAINT_KEYWORDS = [
        'constraint', 'must', 'shall', 'required', 'mandatory',
        'never', 'always', 'limit', 'maximum', 'minimum', 'boundary'
    ]

    RULE_KEYWORDS = [
        'rule', 'policy', 'guideline', 'standard', 'convention',
        'pattern', 'practice', 'principle'
    ]

    # Map internal categories to allowed memory categories
    CATEGORY_MAP = {
        'requirements': 'decision',
        'data_model': 'context',
        'api': 'context',
        'constraint': 'decision',
        'decision': 'decision',
        'rule': 'decision',
        'general': 'learning'
    }

    def __init__(self):
        self.memory = MemoryToolHandler()
        self.patterns = []

    def extract_from_file(self, file_path: str):
        """Extract patterns from a markdown file"""

        path = Path(file_path)
        if not path.exists():
            print(f"File not found: {file_path}", file=sys.stderr)
            return

        content = path.read_text(encoding='utf-8')
        filename = path.name.lower()

        print(f"Analyzing: {path.name}")

        # Determine document type from filename
        doc_type = self._detect_doc_type(filename)

        # Extract based on document type
        if 'spec' in filename or 'specification' in filename:
            self._extract_spec_patterns(content, path)
        elif 'constraint' in filename or 'lattice' in filename:
            self._extract_constraint_patterns(content, path)
        elif 'decision' in filename or 'adr' in filename:
            self._extract_decision_patterns(content, path)
        elif 'rule' in filename:
            self._extract_rule_patterns(content, path)
        else:
            # Generic extraction for other doc types
            self._extract_generic_patterns(content, path)

        # Store patterns
        if self.patterns:
            self._store_patterns()
            print(f"✓ Captured {len(self.patterns)} patterns")
        else:
            print("No patterns detected (may already be captured)")

    def _detect_doc_type(self, filename: str) -> str:
        """Detect document type from filename"""
        if 'spec' in filename:
            return 'specification'
        elif 'constraint' in filename or 'lattice' in filename:
            return 'constraint'
        elif 'decision' in filename or 'adr' in filename:
            return 'decision'
        elif 'rule' in filename:
            return 'rule'
        elif 'roadmap' in filename:
            return 'roadmap'
        return 'general'

    def _extract_spec_patterns(self, content: str, path: Path):
        """Extract patterns from specification documents"""

        # Extract title from first H1
        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else path.stem

        # Extract sections with their content
        sections = self._parse_sections(content)

        # Look for key architectural decisions in specs
        for section_title, section_content in sections.items():
            lower_title = section_title.lower()

            # Core mechanics / requirements
            if any(kw in lower_title for kw in ['mechanic', 'requirement', 'feature', 'core']):
                self.patterns.append({
                    'type': 'specification',
                    'domain': 'architecture',
                    'category': 'requirements',
                    'title': f"{title}: {section_title}",
                    'content': section_content,
                    'source': str(path)
                })

            # Data models / schemas
            elif any(kw in lower_title for kw in ['data', 'model', 'schema', 'structure']):
                self.patterns.append({
                    'type': 'specification',
                    'domain': 'architecture',
                    'category': 'data_model',
                    'title': f"{title}: {section_title}",
                    'content': section_content,
                    'source': str(path)
                })

            # API / Interface definitions
            elif any(kw in lower_title for kw in ['api', 'interface', 'endpoint', 'contract']):
                self.patterns.append({
                    'type': 'specification',
                    'domain': 'architecture',
                    'category': 'api',
                    'title': f"{title}: {section_title}",
                    'content': section_content,
                    'source': str(path)
                })

    def _extract_constraint_patterns(self, content: str, path: Path):
        """Extract patterns from constraint documents"""

        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else path.stem

        # Find constraint blocks (often in tables or bullet lists)
        constraint_blocks = self._find_constraint_blocks(content)

        for i, block in enumerate(constraint_blocks):
            self.patterns.append({
                'type': 'constraint',
                'domain': 'architecture',
                'category': 'constraint',
                'title': f"{title}: Constraint {i+1}",
                'content': block,
                'source': str(path)
            })

        # Also capture the whole document as a reference
        if len(content) > 100:
            self.patterns.append({
                'type': 'constraint_document',
                'domain': 'architecture',
                'category': 'constraint',
                'title': title,
                'content': self._summarize_content(content),
                'source': str(path)
            })

    def _extract_decision_patterns(self, content: str, path: Path):
        """Extract patterns from decision documents (ADRs)"""

        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else path.stem

        sections = self._parse_sections(content)

        # Standard ADR sections
        decision_content = None
        rationale = None
        consequences = None

        for section_title, section_content in sections.items():
            lower = section_title.lower()
            if 'decision' in lower or 'chosen' in lower:
                decision_content = section_content
            elif 'rationale' in lower or 'reason' in lower or 'why' in lower:
                rationale = section_content
            elif 'consequence' in lower or 'impact' in lower or 'result' in lower:
                consequences = section_content

        # Store decision with rationale
        if decision_content:
            full_content = f"## Decision\n{decision_content}"
            if rationale:
                full_content += f"\n\n## Rationale\n{rationale}"
            if consequences:
                full_content += f"\n\n## Consequences\n{consequences}"

            self.patterns.append({
                'type': 'decision',
                'domain': 'architecture',
                'category': 'decision',
                'title': title,
                'content': full_content,
                'source': str(path)
            })

    def _extract_rule_patterns(self, content: str, path: Path):
        """Extract patterns from rule documents"""

        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else path.stem

        # Find numbered rules or bullet points that look like rules
        rules = re.findall(r'(?:^|\n)(?:\d+\.|[-*])\s+(.+?)(?=\n(?:\d+\.|[-*])|\n\n|$)', content, re.DOTALL)

        for i, rule in enumerate(rules[:10]):  # Limit to first 10 rules
            rule = rule.strip()
            if len(rule) > 20 and any(kw in rule.lower() for kw in self.RULE_KEYWORDS + self.CONSTRAINT_KEYWORDS):
                self.patterns.append({
                    'type': 'rule',
                    'domain': 'platform',
                    'category': 'rule',
                    'title': f"{title}: Rule {i+1}",
                    'content': rule,
                    'source': str(path)
                })

    def _extract_generic_patterns(self, content: str, path: Path):
        """Generic extraction for unclassified documents"""

        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else path.stem

        sections = self._parse_sections(content)

        # Look for important sections
        for section_title, section_content in sections.items():
            # Skip very short sections
            if len(section_content) < 50:
                continue

            lower = section_title.lower()

            # Check for decision-like content
            if any(kw in lower for kw in self.DECISION_KEYWORDS):
                self.patterns.append({
                    'type': 'decision',
                    'domain': 'architecture',
                    'category': 'decision',
                    'title': f"{title}: {section_title}",
                    'content': section_content,
                    'source': str(path)
                })

            # Check for constraint-like content
            elif any(kw in lower for kw in self.CONSTRAINT_KEYWORDS):
                self.patterns.append({
                    'type': 'constraint',
                    'domain': 'architecture',
                    'category': 'constraint',
                    'title': f"{title}: {section_title}",
                    'content': section_content,
                    'source': str(path)
                })

    def _parse_sections(self, content: str) -> dict:
        """Parse markdown into sections by headers"""
        sections = {}
        current_header = None
        current_content = []

        for line in content.split('\n'):
            header_match = re.match(r'^(#{1,3})\s+(.+)$', line)
            if header_match:
                # Save previous section
                if current_header:
                    sections[current_header] = '\n'.join(current_content).strip()
                current_header = header_match.group(2)
                current_content = []
            else:
                current_content.append(line)

        # Save last section
        if current_header:
            sections[current_header] = '\n'.join(current_content).strip()

        return sections

    def _find_constraint_blocks(self, content: str) -> list:
        """Find constraint definition blocks"""
        blocks = []

        # Look for table rows with constraint IDs
        table_rows = re.findall(r'\|([^|]+)\|([^|]+)\|', content)
        for row in table_rows:
            if any(kw in row[0].lower() for kw in ['id', 'constraint', 'code']):
                continue  # Skip header row
            if len(row[1].strip()) > 20:
                blocks.append(f"{row[0].strip()}: {row[1].strip()}")

        # Look for definition list style
        definitions = re.findall(r'^([A-Z]+-\d+):\s*(.+?)(?=\n[A-Z]+-\d+:|$)', content, re.MULTILINE | re.DOTALL)
        for code, description in definitions:
            blocks.append(f"{code}: {description.strip()}")

        return blocks

    def _pattern_exists(self, title: str, domain: str) -> bool:
        """Check if pattern already exists in Supabase"""
        try:
            from dotenv import load_dotenv
            import os
            from supabase import create_client

            url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
            key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

            if not url or not key:
                return False

            supabase = create_client(url, key)
            result = supabase.table('claude_memories') \
                .select('id') \
                .eq('title', title) \
                .eq('domain', domain) \
                .limit(1) \
                .execute()

            return len(result.data) > 0
        except:
            return False

    def _summarize_content(self, content: str, max_length: int = 1000) -> str:
        """Summarize content to fit within limit"""
        if len(content) <= max_length:
            return content

        # Take first portion and add truncation note
        truncated = content[:max_length - 50]
        # Try to break at a paragraph
        last_para = truncated.rfind('\n\n')
        if last_para > max_length // 2:
            truncated = truncated[:last_para]

        return truncated + "\n\n[... content truncated ...]"

    def _store_patterns(self):
        """Store patterns in memory"""

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

        for pattern in self.patterns:
            try:
                raw_category = pattern.get('category', 'general')
                category = self.CATEGORY_MAP.get(raw_category, 'learning')
                domain = pattern.get('domain', 'architecture')

                # Create unique slug from title
                title_slug = re.sub(r'[^a-z0-9]+', '_', pattern['title'].lower())[:50]

                # Build content for memory
                content = f"""# {pattern['title']}

**Type:** {pattern['type']}
**Domain:** {domain}
**Category:** {category}
**Source:** {pattern['source']}
**Captured:** {timestamp}

## Content

{pattern['content']}

---

*Automatically extracted from documentation.*
"""

                # Check if pattern already exists by title
                if self._pattern_exists(title_slug, domain):
                    print(f"  → Exists: {pattern['title'][:40]}...")
                    continue

                # Create new pattern using capture for proper Supabase storage
                result = self.memory.capture(
                    domain=domain,
                    category=category,
                    title=title_slug,
                    summary=pattern['content'][:400],
                    content=content,
                    tags=[pattern['type'], category, 'documentation'],
                    source_file=pattern.get('source')
                )
                print(f"  ✓ Created: {pattern['title'][:40]}...")

            except Exception as e:
                print(f"  ⚠️  Failed to store {pattern['title']}: {e}", file=sys.stderr)


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(description='Extract patterns from documentation')
    parser.add_argument('--file', required=True, help='Path to markdown file')
    parser.add_argument('--domain', default='architecture',
                       help='Memory domain (architecture, platform, security)')

    args = parser.parse_args()

    try:
        extractor = DocPatternExtractor()
        extractor.extract_from_file(args.file)
    except Exception as e:
        print(f"Error extracting patterns: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
