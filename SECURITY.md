# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

Only the current major version receives security fixes.

## Scope

This policy covers vulnerabilities in:

- The skillfold compiler (`src/`)
- The Claude Code plugin (`plugin/`)
- The shared skills library (`library/`)

Out of scope:

- Compiled output files (SKILL.md, `.claude/agents/*.md`) - these are static text generated from user-provided config
- User pipeline configs (`skillfold.yaml`) - these are authored and owned by users
- Third-party platforms that consume compiled output

## Reporting a Vulnerability

**Preferred: GitHub Security Advisories**

Report vulnerabilities through [GitHub Security Advisories](https://github.com/byronxlg/skillfold/security/advisories/new). This keeps the report private until a fix is available.

**Fallback: Email**

If you cannot use GitHub Security Advisories, email security reports to byronxlg@users.noreply.github.com with the subject line "skillfold security report".

## What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

## Response Timeline

- **Acknowledgment**: Within 48 hours of report
- **Initial assessment**: Within 7 days
- **Fix or mitigation**: Depends on severity, but we aim for 30 days for critical issues

## Disclosure

We follow coordinated disclosure. We will work with reporters to agree on a disclosure timeline before publishing any advisory.
