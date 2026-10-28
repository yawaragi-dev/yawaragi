#!/bin/sh
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand).
# Exit 0 = skip this deployment, exit 1 = build it. Inverted on purpose;
# that is Vercel's contract.
#
# Why: every deployment's function bundles count toward Hobby's 10 GB of
# Functions Storage for 30 days. Docs-only commits on main
# would each ship an identical production build.

# Previews are off in this project: PR branches are deployed on demand by
# .github/workflows/vercel-deploy.yml, which builds in CI (--prebuilt) and
# never reaches this step.
[ "$VERCEL_ENV" = "production" ] || exit 0

# Compare with the last deployment that succeeded on this branch, so a docs
# commit after a failed code deployment still builds the code. Without it
# (first deployment, or the commit is outside Vercel's shallow clone), fall
# back to the parent commit; if that is missing too, build.
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
git cat-file -e "$base^{commit}" 2>/dev/null || exit 1

# Nothing the app reads at runtime or at build time lives in these paths.
if git diff --quiet "$base" HEAD -- . \
  ':(exclude,glob)**/*.md' \
  ':(exclude)docs/' \
  ':(exclude)LICENSE' \
  ':(exclude).github/'; then
  echo "Only docs changed since $base: skipping the production build."
  exit 0
fi
exit 1
