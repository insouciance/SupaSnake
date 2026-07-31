#!/usr/bin/env node

import workflowContract from './github-sha-workflows.cjs';

const { REQUIRED_PUSH_WORKFLOWS, classifyExactPushRun } = workflowContract;

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';

if (!token || !repository || !sha || !/^[0-9a-f]{40}$/.test(sha)) {
  console.error('Exact-SHA workflow proof requires GITHUB_TOKEN, GITHUB_REPOSITORY, and a 40-character GITHUB_SHA.');
  process.exit(1);
}

let failed = false;
for (const workflow of REQUIRED_PUSH_WORKFLOWS) {
  const url = new URL(
    `${apiBase.replace(/\/$/, '')}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`
  );
  url.searchParams.set('head_sha', sha);
  url.searchParams.set('event', 'push');
  url.searchParams.set('per_page', '20');

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (error) {
    console.error(`::error::Unable to query ${workflow}: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
    continue;
  }

  if (!response.ok) {
    console.error(`::error::GitHub Actions API rejected ${workflow}: HTTP ${response.status}`);
    failed = true;
    continue;
  }

  const result = classifyExactPushRun(await response.json(), sha);
  if (!result.ok) {
    const runId = result.run?.id ? ` run=${result.run.id}` : '';
    console.error(`::error::${workflow} is not a completed successful push workflow for ${sha}: ${result.reason}${runId}`);
    failed = true;
  } else {
    console.log(`${workflow}: exact push run ${result.run.id} completed successfully for ${sha}`);
  }
}

if (failed) process.exit(1);
