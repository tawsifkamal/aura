export const WORKFLOW_FILE_PATH = ".github/workflows/aura-ci.yml";
export const SETUP_BRANCH_NAME = "aura-setup";

export const AURA_WORKFLOW_YAML = `name: Aura PR Notification

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  notify-aura:
    runs-on: ubuntu-latest
    if: github.event.pull_request.base.ref == github.event.repository.default_branch
    steps:
      - name: Notify Aura
        run: |
          curl -s -X POST \\
            https://aura-backend.poppets-grungy03.workers.dev/api/webhooks/pr \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${{ secrets.AURA_API_KEY }}" \\
            -d '{
              "repository_id": \${{ github.event.repository.id }},
              "branch": "\${{ github.head_ref }}",
              "base_branch": "\${{ github.event.pull_request.base.ref }}",
              "pr_number": \${{ github.event.pull_request.number }},
              "commit_sha": "\${{ github.event.pull_request.head.sha }}"
            }'
`;
