# Changesets

This repo uses Changesets for versioned releases.

- Create a release note with `vp run changeset`
- Commit the generated `.changeset/*.md` file
- Merge to `main` to let CI open/update the **Version Packages** PR

Do not manually push release tags.
