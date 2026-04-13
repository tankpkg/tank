@atom-architecture
@ir-schemas
Feature: Atom IR schema validation
  As a package author or internal consumer
  I need canonical IR schemas that validate atom definitions strictly
  So that invalid atoms are caught at parse time and platform-specific details are isolated in extensions

  # ─── Instruction atom ──────────────────────────────────────────────────────
  @high
  Scenario: Valid instruction atom with required fields
    Given an atom object with kind "instruction" and content "./rules.md" and scope "project"
    When the atom is validated against InstructionIR
    Then validation succeeds

  @high
  Scenario: Instruction atom missing required content field
    Given an atom object with kind "instruction" and no content field
    When the atom is validated against InstructionIR
    Then validation fails with an error mentioning "content"

  @high
  Scenario: Instruction atom with extensions preserved
    Given an atom object with kind "instruction" and content "./rules.md"
    And the atom has extensions with key "cursor" and value '{"alwaysApply": true}'
    When the atom is validated against InstructionIR
    Then validation succeeds
    And the parsed atom extensions contain key "cursor"

  @high
  Scenario: Instruction atom with unknown core field rejected
    Given an atom object with kind "instruction" and content "./rules.md" and an unknown field "foo" with value "bar"
    When the atom is validated against InstructionIR
    Then validation fails with an error about unrecognized keys

  # ─── Hook atom ─────────────────────────────────────────────────────────────
  @high
  Scenario: Valid hook atom with DSL handler
    Given an atom object with kind "hook" and event "pre-tool-use"
    And the handler is type "dsl" with actions '[{"action": "block", "match": "rm -rf"}]'
    When the atom is validated against HookIR
    Then validation succeeds
    And the parsed handler type is "dsl"

  @high
  Scenario: Valid hook atom with JS handler
    Given an atom object with kind "hook" and event "pre-tool-use"
    And the handler is type "js" with entry "./hooks/check.ts"
    When the atom is validated against HookIR
    Then validation succeeds
    And the parsed handler type is "js"

  @high
  Scenario: Hook atom with invalid handler type
    Given an atom object with kind "hook" and event "pre-tool-use"
    And the handler is type "invalid"
    When the atom is validated against HookIR
    Then validation fails with an error about handler type discriminator

  # ─── Agent atom ────────────────────────────────────────────────────────────
  @high
  Scenario: Valid agent atom
    Given an atom object with kind "agent" and name "reviewer" and role "Code reviewer"
    And the agent has tools '["read", "grep"]'
    When the atom is validated against AgentIR
    Then validation succeeds

  # ─── Tool atom ─────────────────────────────────────────────────────────────
  @high
  Scenario: Valid tool atom with MCP server config
    Given an atom object with kind "tool" and name "my-tool"
    And the tool has mcp config with command "npx" and args '["-y", "my-server"]'
    When the atom is validated against ToolIR
    Then validation succeeds

  # ─── Rule atom ─────────────────────────────────────────────────────────────
  @high
  Scenario: Valid rule atom
    Given an atom object with kind "rule" and event "pre-tool-use" and match "bash" and policy "block"
    When the atom is validated against RuleIR
    Then validation succeeds

  # ─── Resource atom ─────────────────────────────────────────────────────────
  @high
  Scenario: Valid resource atom
    Given an atom object with kind "resource" and uri "docs://api-reference" and description "API docs"
    When the atom is validated against ResourceIR
    Then validation succeeds

  # ─── Prompt atom ───────────────────────────────────────────────────────────
  @high
  Scenario: Valid prompt atom
    Given an atom object with kind "prompt" and name "deploy" and description "Deploy to prod" and template "./prompts/deploy.md"
    When the atom is validated against PromptIR
    Then validation succeeds

  # ─── Kind discriminator ────────────────────────────────────────────────────
  @high
  Scenario: Atom with missing kind field
    Given an atom object with no kind field
    When the atom is validated against the AtomIR discriminated union
    Then validation fails with an error about missing discriminator "kind"

  @high
  Scenario: Atom with unknown kind value
    Given an atom object with kind "widget"
    When the atom is validated against the AtomIR discriminated union
    Then validation fails with an error about invalid kind value
