# Talk to this Skill

## What

Embedded AI chat on every skill detail page. Users can ask questions about a skill before installing — what it does, whether it's safe, how to use it. Powered by prompt2bot (bot creation) + alice-and-bot (chat UI).

## Why

- Skill discoverability: visitors can interrogate a skill interactively instead of just reading a README
- Collaboration with prompt2bot (uriva, issue #292) — same integration as agentskills.co.il
- Trust: talking to a skill-specific bot gives users a second channel to evaluate quality

## Constraints

### Feature gating

- Button + bubble hidden when `PROMPT2BOT_API_TOKEN` env var is unset
- Feature silently disabled — no error messages, no broken UI

### Bot lifecycle

- One bot per skill version (not per skill)
- Bot created lazily on first user click, not at publish time
- Bot never created for a skill version with status != 'published'
- Bot creation is idempotent — if `prompt2botBotId` exists in DB for this version, reuse it
- Bot creation failure is non-blocking — return error to client, skill page still works

### Security

- `prompt2botSecret` (Remote Tools Secret) stored in DB but NEVER included in any client-facing query result or API response
- Only `chatLink` and `botPublicKey` are exposed to the browser

### Attribution

- "Powered by prompt2bot · alice&bot" visible whenever the chat widget is open
- prompt2bot + alice-and-bot listed on the About page tech stack

### UX

- Desktop: "Talk to this skill" button in the skill header + floating bubble (bottom-right)
- Mobile: button in the mobile action bar alongside Star + Download
- Both open the same Dialog overlay with the alice-and-bot Chat component
- Chat styled to match Tank dark theme (tank-green-ui primary, dark background)

## Examples

| Input                                                    | Expected Output                                                |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| Visitor clicks "Talk to this skill" (no bot exists yet)  | API call creates bot → chat opens with bot that knows README   |
| Visitor clicks "Talk to this skill" (bot already exists) | Chat opens immediately — no API call, no delay                 |
| `PROMPT2BOT_API_TOKEN` is unset                          | No button, no bubble rendered anywhere                         |
| Skill has no README, only description                    | Button still shows; bot uses description + metadata as context |
| Skill page on mobile                                     | Button visible in mobile action bar                            |
| Bot creation API fails                                   | Error shown to user; skill page continues to work normally     |
| Attacker inspects network responses                      | `prompt2botSecret` never appears in any response body          |
