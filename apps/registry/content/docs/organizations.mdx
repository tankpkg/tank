---
title: Organizations & Teams
description: Create organizations in Tank to publish scoped AI agent skills, manage team members, and control access with invitations and role-based permissions.
---

# Organizations & Teams

Organizations let teams publish AI agent skills under a shared namespace, manage members, and control who can publish under a given scope. If you've used npm orgs or GitHub organizations, the concept is the same — `@your-org/skill-name` signals provenance and shared ownership.

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
