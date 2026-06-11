
# Context Engine v2

## Retrieval Formula
Score = 0.4*ExplicitReference + 0.2*RecentEdit + 0.15*GitDiff +
0.1*ImportGraph + 0.1*SemanticSimilarity + 0.05*SkillWeight

## Chunk Strategy
- Code: 150-300 lines
- Docs: 500-1500 tokens
- Keep symbol boundaries intact

## Repository Map
Build graph:
File -> Imports -> Symbols -> References

## Token Budget
- System: 10%
- Memory: 15%
- Skills: 10%
- Conversation: 15%
- Retrieved Context: 50%

## Style Consistency
Store architecture decisions and coding conventions in project memory.
