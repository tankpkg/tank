# Manual E2E Test: Tank Publish Flow

This document describes the complete end-to-end manual test procedure for the Tank CLI publish flow, including login, skill creation, dry-run validation, publishing, and verification.

## Prerequisites

### System Requirements
- **Node.js**: 24.0.0 or later
- **pnpm**: 10.0.0 or later
- **Git**: For cloning and version control

### Environment Variables

Set these in your shell before running tests:

```bash
export GITHUB_CLIENT_ID="your-github-oauth-app-client-id"
export GITHUB_CLIENT_SECRET="your-github-oauth-app-client-secret"
export SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
export BETTER_AUTH_SECRET="your-better-auth-secret"
export DATABASE_URL="postgresql://user:password@localhost:5432/tank"
export SUPABASE_URL="https://your-project.supabase.co"
```

**Note**: If `BETTER_AUTH_SECRET` is not set, the system will use an insecure default. This is acceptable for local testing only.

### Infrastructure Setup

1. **Supabase Storage Bucket**
   - Ensure the `packages` bucket exists in your Supabase project
   - Bucket should be private (not public)
   - Verify in Supabase Dashboard → Storage → Buckets

2. **GitHub OAuth App**
   - Create a GitHub OAuth app at https://github.com/settings/developers
   - Set Authorization callback URL to: `http://localhost:3000/api/auth/callback/github`
   - Copy Client ID and Client Secret to environment variables

3. **Database**
   - Ensure PostgreSQL database is running and accessible via `DATABASE_URL`
   - Run migrations: `pnpm db:migrate`
   - Verify tables exist: `skills`, `skill_versions`, `users`, `sessions`

4. **Web App**
   - Start the web app in a separate terminal:
     ```bash
     pnpm dev --filter=@tank/web
     ```
   - Verify it's running at `http://localhost:3000`
   - Check that `/api/v1/cli-auth/start` and `/api/v1/cli-auth/exchange` endpoints are accessible

### CLI Configuration

The CLI reads from `~/.tank/config.json`. By default, it uses the production registry (`https://tankpkg.dev`). For local testing, override it:

```bash
mkdir -p ~/.tank
cat > ~/.tank/config.json << 'EOF'
{
  "registry": "http://localhost:3000"
}
EOF
```

## Test Procedure

### Step 1: Verify Login Flow

**Objective**: Confirm that `tank login` opens a browser, authenticates via GitHub, and stores the token.

**Actions**:
1. Open a terminal in the project root
2. Run: `pnpm exec tank login`
3. A browser window should open automatically to `http://localhost:3000/api/auth/callback/github?...`
4. If the browser doesn't open, the CLI will print a URL — copy and paste it manually
5. Click "Sign in with GitHub" and authorize the application
6. Return to the terminal

**Expected Output**:
```
Starting login...
Opened browser for authentication.
Waiting for authorization...
Logged in as {Your GitHub Name}
```

**Verification**:
- Check that `~/.tank/config.json` now contains a `token` field
- Verify the `user` object has `name` and `email` fields
- Example:
  ```json
  {
    "registry": "http://localhost:3000",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "name": "Your Name",
      "email": "your.email@example.com"
    }
  }
  ```

---

### Step 2: Create a Test Skill

**Objective**: Set up a test skill directory with valid `skills.json` and supporting files.

**Actions**:
1. Create a test directory:
   ```bash
   mkdir -p /tmp/test-skill
   cd /tmp/test-skill
   ```

2. Create `skills.json`:
   ```json
   {
     "name": "@test/my-skill",
     "version": "0.1.0",
     "description": "A test skill for E2E testing",
     "skills": {},
     "permissions": {
       "network": {
         "outbound": []
       },
       "filesystem": {
         "read": [],
         "write": []
       },
       "subprocess": false
     }
   }
   ```

3. Create `SKILL.md` (required for packaging):
   ```markdown
   # My Test Skill

   This is a test skill for E2E testing the Tank publish flow.

   ## Usage

   This skill demonstrates the basic structure of a Tank skill.

   ## Permissions

   - No network access
   - No filesystem access
   - No subprocess execution
   ```

4. Create a sample file to include in the package:
   ```bash
   mkdir -p src
   echo "// Test skill implementation" > src/index.ts
   ```

**Expected Output**:
- Directory structure:
  ```
  /tmp/test-skill/
  ├── skills.json
  ├── SKILL.md
  └── src/
      └── index.ts
  ```

**Verification**:
- `skills.json` is valid JSON and matches the schema
- `SKILL.md` exists and is readable
- At least one additional file exists (for file count verification)

---

### Step 3: Dry-Run Publish

**Objective**: Validate the skill package without uploading to the registry.

**Actions**:
1. From the test skill directory (`/tmp/test-skill`), run:
   ```bash
   pnpm exec tank publish --dry-run
   ```

2. Observe the output

**Expected Output**:
```
Packing...
name:    @test/my-skill
version: 0.1.0
size:    X.X KB (3 files)
tarball: Y.Y KB (compressed)
Dry run complete — no files were uploaded.
```

**Verification**:
- No files were uploaded to Supabase Storage
- The skill name and version are correct
- File count is accurate (should be 3: `skills.json`, `SKILL.md`, `src/index.ts`)
- Tarball size is reasonable (typically 0.5–2 KB for a minimal skill)

---

### Step 4: Publish the Skill

**Objective**: Upload the skill to the Tank registry.

**Actions**:
1. From the test skill directory, run:
   ```bash
   pnpm exec tank publish
   ```

2. Wait for the operation to complete

**Expected Output**:
```
Packing...
Publishing...
Uploading...
Confirming...
Published @test/my-skill@0.1.0 (X.X KB, 3 files)
```

**Verification**:
- The command exits with status code 0 (success)
- The success message includes the skill name, version, size, and file count
- No errors are printed to stderr

---

### Step 5: Verify Storage Upload

**Objective**: Confirm that the tarball was uploaded to Supabase Storage.

**Actions**:
1. Open the Supabase Dashboard: https://app.supabase.com
2. Navigate to your project
3. Go to **Storage** → **Buckets** → **packages**
4. Look for a folder structure: `@test/my-skill/0.1.0/`
5. Inside, verify the file: `@test/my-skill-0.1.0.tgz`

**Expected Output**:
- File path: `@test/my-skill/0.1.0/@test/my-skill-0.1.0.tgz`
- File size: Matches the "compressed" size from the publish output
- File is readable (no permission errors)

**Verification**:
- Click on the file to view its metadata
- Confirm the upload timestamp is recent (within the last few minutes)
- Optionally, download the file and verify it's a valid gzip tarball:
  ```bash
  tar -tzf @test/my-skill-0.1.0.tgz | head -10
  ```

---

### Step 6: Verify Database Records

**Objective**: Confirm that skill metadata was stored in the database.

**Actions**:
1. Open the Supabase Dashboard
2. Go to **Table Editor**
3. Check the **skills** table:
   - Look for a row with `name = '@test/my-skill'`
   - Verify `owner_id` is your user ID
   - Verify `created_at` is recent

4. Check the **skill_versions** table:
   - Look for a row with `skill_id` matching the skill from step 3
   - Verify `version = '0.1.0'`
   - Verify `status = 'published'`
   - Verify `tarball_url` contains the path from Step 5
   - Verify `integrity` (SHA-256 hash) is populated
   - Verify `file_count = 3`
   - Verify `tarball_size` matches the compressed size

**Expected Output**:
- **skills** table:
  ```
  id: <uuid>
  name: @test/my-skill
  owner_id: <your-user-id>
  created_at: 2026-02-14T12:34:56Z
  ```

- **skill_versions** table:
  ```
  id: <uuid>
  skill_id: <skill-id>
  version: 0.1.0
  status: published
  tarball_url: @test/my-skill/0.1.0/@test/my-skill-0.1.0.tgz
  integrity: sha256-<hash>
  file_count: 3
  tarball_size: <bytes>
  created_at: 2026-02-14T12:34:56Z
  ```

**Verification**:
- All fields are populated correctly
- No NULL values in required fields
- Timestamps are recent and consistent

---

### Step 7: Attempt Duplicate Publish

**Objective**: Verify that publishing the same version twice is rejected.

**Actions**:
1. From the test skill directory, run the publish command again:
   ```bash
   pnpm exec tank publish
   ```

2. Observe the error

**Expected Output**:
```
Packing...
Publishing...
Publish failed
Version already exists. Bump the version in skills.json
```

**Verification**:
- The command exits with a non-zero status code (error)
- The error message clearly indicates the version already exists
- No files were uploaded to Storage
- No new records were created in the database

---

### Step 8: Version Bump and Republish

**Objective**: Verify that bumping the version allows a successful republish.

**Actions**:
1. Edit `skills.json` to bump the version:
   ```bash
   cd /tmp/test-skill
   # Change "version": "0.1.0" to "version": "0.2.0"
   sed -i '' 's/"version": "0.1.0"/"version": "0.2.0"/' skills.json
   ```

2. Verify the change:
   ```bash
   grep '"version"' skills.json
   ```
   Should output: `"version": "0.2.0"`

3. Publish the new version:
   ```bash
   pnpm exec tank publish
   ```

**Expected Output**:
```
Packing...
Publishing...
Uploading...
Confirming...
Published @test/my-skill@0.2.0 (X.X KB, 3 files)
```

**Verification**:
- The command exits with status code 0
- The success message shows version `0.2.0`
- A new file exists in Storage: `@test/my-skill/0.2.0/@test/my-skill-0.2.0.tgz`
- A new row exists in **skill_versions** with `version = '0.2.0'`
- The **skills** table still has only one row for `@test/my-skill`

---

### Step 9: Logout

**Objective**: Clean up authentication state.

**Actions**:
1. Run:
   ```bash
   pnpm exec tank logout
   ```

2. Verify the output

**Expected Output**:
```
Logged out.
```

**Verification**:
- The `token` field is removed from `~/.tank/config.json`
- The `user` field is removed from `~/.tank/config.json`
- Subsequent `tank publish` commands fail with "Not logged in. Run: tank login"

---

## Expected Behavior Summary

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `tank login` | Browser opens, user authenticates, token stored |
| 2 | Create skill files | Directory with `skills.json`, `SKILL.md`, and source files |
| 3 | `tank publish --dry-run` | Validation output, no upload |
| 4 | `tank publish` | Success message with size and file count |
| 5 | Check Storage | Tarball file exists at correct path |
| 6 | Check Database | `skills` and `skill_versions` rows created |
| 7 | `tank publish` (again) | 409 error: "Version already exists" |
| 8 | Bump version, `tank publish` | Success with new version |
| 9 | `tank logout` | Token removed from config |

---

## Known Blockers

### Missing Environment Variables
- **Symptom**: Web app fails to start or endpoints return 500 errors
- **Fix**: Ensure all required environment variables are set (see Prerequisites)
- **Check**: `echo $GITHUB_CLIENT_ID` should print a non-empty value

### Supabase Storage Bucket Not Found
- **Symptom**: Upload fails with "Bucket not found" or 404 error
- **Fix**: Create the `packages` bucket in Supabase Dashboard → Storage
- **Check**: Verify bucket exists and is private

### GitHub OAuth App Not Configured
- **Symptom**: Login redirects to GitHub but fails with "Invalid client_id"
- **Fix**: Create a GitHub OAuth app and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- **Check**: Verify callback URL is `http://localhost:3000/api/auth/callback/github`

### Database Connection Failed
- **Symptom**: Web app crashes with "ECONNREFUSED" or "password authentication failed"
- **Fix**: Ensure PostgreSQL is running and `DATABASE_URL` is correct
- **Check**: `psql $DATABASE_URL -c "SELECT 1"` should succeed

### Web App Not Running
- **Symptom**: CLI commands fail with "ECONNREFUSED" or "Connection refused"
- **Fix**: Start the web app: `pnpm dev --filter=@tank/web`
- **Check**: `curl http://localhost:3000/api/health` should return 200

### Token Expired or Invalid
- **Symptom**: Publish fails with 401 "Authentication failed"
- **Fix**: Run `tank login` again to refresh the token
- **Check**: Verify `~/.tank/config.json` has a valid `token` field

---

## Troubleshooting

### "Not logged in. Run: tank login"
- **Cause**: No token in `~/.tank/config.json`
- **Fix**: Run `tank login` and complete the authentication flow
- **Verify**: Check that `~/.tank/config.json` contains a `token` field

### "No skills.json found in {directory}"
- **Cause**: `skills.json` is missing or in the wrong directory
- **Fix**: Ensure you're in the skill directory and `skills.json` exists
- **Verify**: `ls -la skills.json` should show the file

### "Failed to read or parse skills.json"
- **Cause**: `skills.json` is not valid JSON
- **Fix**: Validate the JSON: `jq . skills.json`
- **Verify**: Use a JSON linter to check syntax

### "Version already exists. Bump the version in skills.json"
- **Cause**: Attempting to publish a version that already exists
- **Fix**: Edit `skills.json` and increment the version (e.g., 0.1.0 → 0.2.0)
- **Verify**: Run `grep '"version"' skills.json` to confirm the change

### "You don't have permission to publish to this organization"
- **Cause**: User is not an owner or member of the organization
- **Fix**: Add the user to the organization or use a different organization name
- **Verify**: Check organization membership in Supabase or GitHub

### "Failed to upload tarball: 403 Forbidden"
- **Cause**: Supabase Storage bucket permissions are incorrect
- **Fix**: Ensure the `packages` bucket is private and the service role key is correct
- **Verify**: Check `SUPABASE_SERVICE_ROLE_KEY` is set and valid

### "Login timed out. Please try again."
- **Cause**: Browser authentication took longer than 5 minutes
- **Fix**: Run `tank login` again
- **Verify**: Ensure the browser window is still open and you're on the GitHub auth page

### "Could not open browser automatically"
- **Cause**: The system cannot open a browser (common in headless environments)
- **Fix**: The CLI will print a URL — copy and paste it into a browser manually
- **Verify**: Complete the authentication flow in the browser and return to the terminal

---

## Cleanup

After testing, you can clean up test data:

### Remove Test Skill from Storage
```bash
# Via Supabase Dashboard:
# Storage → packages → @test/my-skill → Delete folder
```

### Remove Test Skill from Database
```bash
# Via Supabase Dashboard:
# Table Editor → skills → Find @test/my-skill → Delete row
# (This will cascade delete skill_versions)
```

### Remove Test Directory
```bash
rm -rf /tmp/test-skill
```

### Reset CLI Config
```bash
rm ~/.tank/config.json
```

---

## Success Criteria

A successful E2E test run includes:

- ✅ Login completes without errors
- ✅ Dry-run validates the skill without uploading
- ✅ Publish succeeds with correct output
- ✅ Tarball exists in Supabase Storage at the correct path
- ✅ Database records are created with correct metadata
- ✅ Duplicate publish is rejected with 409 error
- ✅ Version bump allows successful republish
- ✅ Logout removes the token from config

If all steps pass, the publish flow is working correctly.
