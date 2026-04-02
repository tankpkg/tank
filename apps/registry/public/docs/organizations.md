---
title: Organizations & Teams
description: Create organizations in Tank to publish scoped AI agent skills, manage team members, and control access with invitations and role-based permissions.
---

# Organizations & Teams

Organizations let teams publish AI agent skills under a shared namespace, manage members, and control who can publish under a given scope. If you've used npm orgs or GitHub organizations, the concept is the same — `@your-org/skill-name` signals provenance and shared ownership.

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- LEFT: unscoped — suspicious -->
  <rect x="10" y="10" width="360" height="120" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="190" y="34" text-anchor="middle" fill="#dc2626" font-size="13" font-weight="600">@random-user/code-review</text>
  <text x="190" y="52" text-anchor="middle" fill="#64748b" font-size="10">Who is this?</text>
  <line x1="60" y1="68" x2="320" y2="68" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="30" y="86" text-anchor="start" fill="#dc2626" font-size="10">✗</text>
  <text x="44" y="86" text-anchor="start" fill="#64748b" font-size="10">No team behind it</text>
  <text x="30" y="104" text-anchor="start" fill="#dc2626" font-size="10">✗</text>
  <text x="44" y="104" text-anchor="start" fill="#64748b" font-size="10">No trust signal — could be anyone</text>
  <text x="30" y="122" text-anchor="start" fill="#dc2626" font-size="10">✗</text>
  <text x="44" y="122" text-anchor="start" fill="#64748b" font-size="10">No org controls who publishes</text>

  <!-- RIGHT: org-scoped — verified -->
  <rect x="420" y="10" width="370" height="120" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="605" y="34" text-anchor="middle" fill="#16a34a" font-size="13" font-weight="600">@acme/code-review</text>
  <text x="605" y="52" text-anchor="middle" fill="#10b981" font-size="10">Acme Corp — verified org</text>
  <line x1="470" y1="68" x2="740" y2="68" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="440" y="86" text-anchor="start" fill="#16a34a" font-size="10">✓</text>
  <text x="454" y="86" text-anchor="start" fill="currentColor" font-size="10" font-weight="600">5 members, role-based access</text>
  <text x="440" y="104" text-anchor="start" fill="#16a34a" font-size="10">✓</text>
  <text x="454" y="104" text-anchor="start" fill="currentColor" font-size="10" font-weight="600">Team-controlled publishing</text>
  <text x="440" y="122" text-anchor="start" fill="#16a34a" font-size="10">✓</text>
  <text x="454" y="122" text-anchor="start" fill="currentColor" font-size="10" font-weight="600">@acme scope enforced server-side</text>

  <!-- VS divider -->
  <rect x="382" y="52" width="28" height="28" rx="14" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="396" y="71" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">vs</text>

  <!-- Bottom takeaway -->
  <rect x="10" y="148" width="780" height="40" rx="8" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.3"/>
  <text x="400" y="168" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">Scoped names = provenance. Only org members can publish to @acme — enforced at the API level.</text>
  <text x="400" y="182" text-anchor="middle" fill="#64748b" font-size="9">You always know who published it.</text>
</svg>
</div>

## Why Organizations Exist

Publishing under a personal account works fine for individual developers. But teams need:

- **Scoped package names** — `@acme/code-review` is immediately more trustworthy than an unscoped skill from an unknown author
- **Shared publishing access** — multiple team members can release new versions without sharing credentials
- **Centralized access control** — add and remove members from one place as your team changes
- **Enterprise SSO** — integrate with your identity provider so employees log in with company credentials

A skill published under `@acme/skill-name` can only be published by a member of the `acme` organization. Tank enforces this at the API level — the publisher's session must contain org membership for the scoped name being used.

## Creating an Organization

Go to [Dashboard → Organizations](/orgs) and click **New Organization**.

You'll be prompted for:

- **Name** — the human-readable display name (e.g. `Acme Corp`)
- **Slug** — the URL-safe identifier used in scoped skill names (e.g. `acme`)

### Slug Rules

Slugs follow the same constraints as GitHub organization names:

- Lowercase letters, digits, and hyphens only
- Cannot start or end with a hyphen
- Maximum 39 characters
- Pattern: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`

The dashboard auto-generates a slug from your organization name — for example, "Acme Corp" becomes `acme-corp`. You can edit it before saving.

<Callout type="warn">
  Slugs cannot be changed after creation. Choose carefully — renaming would break all existing scoped skill names
  published under the old slug.
</Callout>

Once created, you are automatically the **owner** of the organization.

## Publishing Scoped Skills Under an Org

With an org created, any member can publish skills under its namespace:

```bash
# In a skill directory with tank.json name set to "@acme/my-skill"
tank publish
```

Your `tank.json` must declare the scoped name:

```json
{
  "name": "@acme/my-skill",
  "version": "1.0.0",
  "description": "Does one thing well",
  "permissions": {
    "network": { "outbound": ["api.example.com"] },
    "filesystem": { "read": ["./src/**"] },
    "subprocess": false
  }
}
```

<Callout type="info">
  You must be a member of the `acme` organization to publish under `@acme/`. The CLI verifies your session against org
  membership during the publish flow. Publishing under a scope you don't belong to returns `403 Forbidden`.
</Callout>

Scoped skills install the same way as unscoped ones:

```bash
tank install @acme/my-skill
```

## Managing Members

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 720 135" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Owner tier -->
  <rect x="15" y="8" width="690" height="34" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <rect x="15" y="8" width="92" height="34" rx="10" fill="#16a34a" stroke="#16a34a" stroke-width="1.5"/>
  <text x="61" y="30" text-anchor="middle" fill="white" font-size="11" font-weight="600">Owner</text>
  <text x="128" y="22" fill="currentColor" font-size="10">Full control</text>
  <text x="250" y="22" fill="#64748b" font-size="10">delete org</text>
  <text x="360" y="22" fill="#64748b" font-size="10">transfer ownership</text>
  <text x="128" y="35" fill="#64748b" font-size="9">includes every admin + member permission</text>
  <!-- Admin tier -->
  <rect x="15" y="50" width="690" height="34" rx="10" fill="none" stroke="#eab308" stroke-width="1.5"/>
  <rect x="15" y="50" width="92" height="34" rx="10" fill="#eab308" stroke="#eab308" stroke-width="1.5"/>
  <text x="61" y="72" text-anchor="middle" fill="white" font-size="11" font-weight="600">Admin</text>
  <text x="128" y="64" fill="currentColor" font-size="10">manage members</text>
  <text x="270" y="64" fill="#64748b" font-size="10">invite / remove</text>
  <text x="390" y="64" fill="#64748b" font-size="10">edit settings</text>
  <text x="128" y="77" fill="#64748b" font-size="9">includes every member permission</text>
  <!-- Member tier -->
  <rect x="15" y="92" width="690" height="34" rx="10" fill="none" stroke="#64748b" stroke-width="1.5"/>
  <rect x="15" y="92" width="92" height="34" rx="10" fill="#64748b" stroke="#64748b" stroke-width="1.5"/>
  <text x="61" y="114" text-anchor="middle" fill="white" font-size="11" font-weight="600">Member</text>
  <text x="128" y="106" fill="currentColor" font-size="10">publish skills</text>
  <text x="255" y="106" fill="#64748b" font-size="10">view members</text>
  <text x="382" y="106" fill="#64748b" font-size="10">install private skills</text>
</svg>
</div>

### Inviting Members

From the organization settings page, go to **Members → Invite Member**. Enter the email address of the person you want to add.

Tank sends an invitation email with a secure link. The recipient must:

1. Click the link in the email (valid for 48 hours)
2. Log in or create a Tank account if they haven't already
3. Accept the invitation from their dashboard at [Dashboard → Organizations → Pending Invitations](/orgs/accept-invitation)

Pending invitations appear in both the org settings (for admins to track) and the invitee's dashboard.

### Accepting an Invitation

Invited members see a **Pending Invitations** section on their Organizations page. Clicking **Accept** grants them immediate publish access under the org's scope.

If the invitation email link expires, an org admin can resend the invitation from the Members panel.

### Removing Members

Org admins can remove any member from the Members panel. Removing a member immediately revokes their ability to publish new versions under the org scope. Skills they previously published remain available — removal is not retroactive.

<Callout type="warn">
  Removing yourself as the only admin of an organization locks the org. Make sure at least one other member has admin
  rights before removing yourself.
</Callout>

## Private Skills & Access Control

Each skill has a visibility setting that controls who can install it:

| Visibility | Who Can Install                                                            |
| ---------- | -------------------------------------------------------------------------- |
| `public`   | Anyone, including unauthenticated users                                    |
| `private`  | Only authenticated members of the owning org                               |
| `org`      | Members of the org and explicitly granted users (via `skill_access` table) |

Set visibility at publish time:

```bash
tank publish --private          # Private to your org
tank publish --visibility org   # Org-level access
tank publish                    # Defaults to public
```

Private and org-level skills do not appear in public search results. They are only visible to authenticated members of the owning organization.

<Callout type="info">
  The `skill_access` table allows fine-grained grants — for example, giving a specific external user access to a private
  org skill without adding them as a full org member. This is useful for partner integrations.
</Callout>

## Enterprise OIDC Single Sign-On

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 700 100" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="oidc-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
    <marker id="oidc-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#16a34a"/></marker>
  </defs>
  <!-- Employee -->
  <rect x="10" y="28" width="100" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="60" y="48" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">Employee</text>
  <text x="60" y="62" text-anchor="middle" fill="#64748b" font-size="9">clicks login</text>
  <!-- Arrow 1 -->
  <line x1="110" y1="50" x2="148" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#oidc-arrow)"/>
  <!-- IdP -->
  <rect x="148" y="22" width="140" height="56" rx="8" fill="none" stroke="#eab308" stroke-width="1.5"/>
  <text x="218" y="44" text-anchor="middle" fill="#eab308" font-size="11" font-weight="600">Corporate IdP</text>
  <text x="218" y="60" text-anchor="middle" fill="#64748b" font-size="9">Okta / Azure AD</text>
  <!-- Arrow 2 -->
  <line x1="288" y1="50" x2="326" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#oidc-arrow)"/>
  <text x="307" y="40" text-anchor="middle" fill="#64748b" font-size="8">OIDC</text>
  <!-- Tank callback -->
  <rect x="326" y="22" width="130" height="56" rx="8" fill="#10b981" stroke="#10b981" stroke-width="1.5"/>
  <text x="391" y="44" text-anchor="middle" fill="white" font-size="11" font-weight="600">Tank Verifies</text>
  <text x="391" y="60" text-anchor="middle" fill="white" font-size="9" opacity="0.85">ID token + claims</text>
  <!-- Arrow 3 -->
  <line x1="456" y1="50" x2="494" y2="50" stroke="#16a34a" stroke-width="1.5" marker-end="url(#oidc-arrow-green)"/>
  <!-- Auto-provision -->
  <rect x="494" y="22" width="196" height="56" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="592" y="44" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">Auto-Provision</text>
  <text x="592" y="60" text-anchor="middle" fill="#64748b" font-size="9">Org membership granted</text>
</svg>
</div>

Organizations on enterprise plans can configure OpenID Connect (OIDC) SSO so team members authenticate with your identity provider (Okta, Azure AD, Google Workspace, etc.) instead of GitHub.

### Environment Variables

Configure the following in your self-hosted Tank deployment:

| Variable             | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `OIDC_ISSUER`        | Your IdP's issuer URL (e.g. `https://your-company.okta.com`) |
| `OIDC_CLIENT_ID`     | OAuth 2.0 client ID from your IdP                            |
| `OIDC_CLIENT_SECRET` | OAuth 2.0 client secret from your IdP                        |
| `OIDC_DISPLAY_NAME`  | Button label on the login page (e.g. `Sign in with Okta`)    |

```bash
OIDC_ISSUER=https://your-company.okta.com
OIDC_CLIENT_ID=0oa...
OIDC_CLIENT_SECRET=...
OIDC_DISPLAY_NAME=Sign in with Okta
```

### How SSO Login Works

1. User clicks **Sign in with [Provider]** on the Tank login page
2. They are redirected to your IdP's authorization endpoint
3. After authenticating with company credentials, they are redirected back to Tank
4. Tank creates or links their account using the `sub` claim from the ID token
5. The user lands on their dashboard with full access

<Callout type="info">
  OIDC SSO login creates a standard Tank session. The user can still generate API tokens for CLI use — SSO only affects
  the web login flow, not Bearer token authentication.
</Callout>

### Setting Up Your IdP

Your IdP application must be configured with:

- **Redirect URI**: `https://your-tank-domain.com/api/auth/callback/generic-oidc`
- **Response type**: `code`
- **Scopes**: `openid email profile`

For detailed self-hosting instructions including OIDC setup, see the [Self-Hosting guide](/docs/self-hosting).

## Organization API

Org management is also available via the Admin API for programmatic workflows:

```bash
# List organizations
curl https://tankpkg.dev/api/admin/orgs \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get a specific org with members
curl https://tankpkg.dev/api/admin/orgs/{orgId} \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Remove a member
curl -X DELETE https://tankpkg.dev/api/admin/orgs/{orgId}/members/{memberId} \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The admin API requires a token with the `skills:admin` scope. See the [API Reference](/docs/api) for full details.
