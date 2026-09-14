# Security policy

Please report suspected vulnerabilities privately through the repository's GitHub security
advisory flow. Do not include secrets or customer source code in public issues.

The baseline CLI is read-only with respect to the analyzed directory: it reads source files
and writes only to the output directory supplied by `--out`. It does not execute project code,
use network access, read credentials, or modify Git state.

This is an early prototype. Treat generated HTML and JSON as local review artifacts and inspect
the output directory before sharing it.
