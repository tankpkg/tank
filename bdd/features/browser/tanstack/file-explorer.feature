Feature: Skill detail — Files tab
  As a developer browsing skills
  I want a GitHub-style source code browser
  So I can inspect a skill's files before installing

  Background:
    Given the registry has a skill "@tank/react" with files
      | SKILL.md | skills.json | LICENSE | references/hooks.md | references/patterns.md |

  Scenario: Files tab shows file tree with all folders expanded
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    Then I should see a file tree panel on the left
    And all folders should be expanded by default
    And directories should appear before files in each level
    And files should be sorted alphabetically within each group

  Scenario: SKILL.md is selected and previewed by default
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    Then "SKILL.md" should be selected in the file tree
    And the preview pane should show the SKILL.md content
    And the preview header should display "SKILL.md"

  Scenario: Monaco editor renders with syntax highlighting
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    Then the preview pane should contain a Monaco editor
    And the editor should be in read-only mode
    And the editor should show line numbers
    And the minimap should be visible

  Scenario: Clicking a file loads its content in the editor
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    And I click "skills.json" in the file tree
    Then the preview header should display "skills.json"
    And the Monaco editor should show JSON content with syntax highlighting

  Scenario: Clicking a folder toggles expand/collapse
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    And I click the "references" folder in the file tree
    Then the "references" folder should be collapsed
    And its children should not be visible
    When I click the "references" folder again
    Then the "references" folder should be expanded

  Scenario: Copy button copies file content to clipboard
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    And I click the "Copy" button in the preview header
    Then the clipboard should contain the SKILL.md content
    And the button should show "Copied!" text
    And after 2 seconds the button should revert to "Copy"

  Scenario: File tree shows appropriate icons
    When I navigate to "/skills/@tank/react"
    And I click the "Files" tab
    Then folder nodes should show folder icons
    And file nodes should show file-type-appropriate icons

  Scenario: Empty file list shows placeholder
    Given the registry has a skill "@tank/empty-skill" with no files
    When I navigate to "/skills/@tank/empty-skill"
    And I click the "Files" tab
    Then I should see "No files in this package."
    And there should be no file tree or editor
