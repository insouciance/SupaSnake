/**
 * One-time Discord application setup: register the Linked Roles
 * role-connection metadata schema (Player Identity v1 section 8.4 -
 * Discord allows max 5 fields; we use exactly 5).
 *
 * Server owners can then build native role gates like "Mastery 5+",
 * "Founder" or "1,000 extractions" in Discord's own role settings.
 *
 * Run once (idempotent - PUT replaces the whole schema):
 *   npx tsx scripts/discord-register-metadata.ts
 * or:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     scripts/discord-register-metadata.ts
 *
 * Requires DISCORD_CLIENT_ID + DISCORD_BOT_TOKEN in the environment
 * (source .env first). Plain fetch, no SDK.
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * The 5 registered fields (doc section 8.4). Types per Discord:
 *   2 = INTEGER_GREATER_THAN_OR_EQUAL, 7 = BOOLEAN_EQUAL
 */
const METADATA_SCHEMA = [
  {
    key: 'mastery_level',
    name: 'Mastery Level',
    description: 'Highest dynasty mastery level (0-10)',
    type: 2,
  },
  {
    key: 'legacy_score',
    name: 'Legacy Score',
    description: 'Sum of banked record tier points',
    type: 2,
  },
  {
    key: 'gauntlet_champion',
    name: 'Season Champion',
    description: 'Rostered on a season championship clan',
    type: 7,
  },
  {
    key: 'founder',
    name: 'Founder',
    description: 'Account created before launch day',
    type: 7,
  },
  {
    key: 'extraction_count',
    name: 'Extractions',
    description: 'Total successful extractions',
    type: 2,
  },
];

async function main(): Promise<void> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!clientId || !botToken) {
    console.error('DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN must be set (source .env)');
    process.exit(1);
  }

  const response = await fetch(
    `${DISCORD_API}/applications/${clientId}/role-connections/metadata`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (https://supasnake.com, 0.1)',
      },
      body: JSON.stringify(METADATA_SCHEMA),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    console.error(`Registration failed: HTTP ${response.status}`);
    console.error(body);
    process.exit(1);
  }

  console.log(`Registered ${METADATA_SCHEMA.length} Linked Roles metadata fields:`);
  console.log(JSON.stringify(JSON.parse(body), null, 2));
}

main().catch((err) => {
  console.error('Registration error:', err);
  process.exit(1);
});
