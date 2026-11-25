# Publishing

This repository publishes to the Visual Studio Marketplace using GitHub Actions
Trusted Publishing. It uses GitHub OIDC, not an Entra managed identity or a PAT.

## One-time setup

1. Sign in to the [Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and open the `KevinMills` publisher.
2. Select **Trusted Publishing**, expand **Create**, and enter:
   - Policy name: `GitHub release workflow` (or another descriptive name)
   - Repository owner: `mgfarmer`
   - Repository: `git-repo-window-colors`
   - Workflow: `publish.yml`
   - Environment: leave empty
3. Create the policy. For a private repository, run the workflow within 48 hours
   to activate the policy.
4. Commit and push the publishing workflow to the `master` branch. Protect that
   branch and limit who can modify the workflow or run it, since those users can
   publish under this policy.

No GitHub secret or Azure subscription is required. The policy authorizes the
workflow as a whole; protect the GitHub repository accordingly.

## Publish a version

1. Set a new, unpublished `version` in `package.json`. For subsequent patch
   versions, `yarn version --patch --no-git-tag-version` can do this locally.
   Release and pre-release versions must be distinct; deleted versions cannot
   be reused. Confirm the current version before incrementing it.
2. Commit and push the version and release changes to `master`.
3. In GitHub, open **Actions** > **Publish extension** > **Run workflow**,
   select `master` and choose `release` or `pre-release`.
4. Check the workflow result and the Marketplace listing. The workflow publishes
   the committed version and does not change the version or create a Git tag.

The previous `yarn publish-release` and `yarn publish-prerelease` scripts were
removed because they incremented the version before attempting PAT-based local
publishing.