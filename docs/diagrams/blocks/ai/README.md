# AI feature block diagrams (Mermaid)

Block-level architecture for Damascus University Journal AI capabilities. The browser **never** calls `ai-service` directly; Nest is the BFF over REST, then gRPC on port **5246**.

Design record and flags: [`docs/plans/ai-service.md`](../../../plans/ai-service.md).

## Render

Paste any `.mmd` file into [mermaid.live](https://mermaid.live) or use a Mermaid preview in the editor.

## Diagrams

| Diagram | File | Covers |
|---------|------|--------|
| Shared platform | [`01-ai-platform.mmd`](./01-ai-platform.mmd) | All AI features — Next.js → Nest → gRPC ai-service |
| Arabic discipline | [`02-discipline-classifier.mmd`](./02-discipline-classifier.mmd) | AraBERT `ClassifierService` (suggest + submit) |
| Local LLM (LM Studio) | [`03-openai-llm.mmd`](./03-openai-llm.mmd) | Keyword suggestions + copyedit reference cross-check via fine-tuned **Qwen 2.5 7B** in LM Studio |
| Vector / Chroma | [`04-vector-chroma.mmd`](./04-vector-chroma.mmd) | Published indexing, semantic catalog search, related articles, corpus similarity report, suggested reviewers |
| Copyedit workbench | [`05-copyedit-workbench.mmd`](./05-copyedit-workbench.mmd) | One analysis panel: format rules + LanguageTool + reference AI |

**Not on ai-service:** copyedit grammar/spelling uses **LanguageTool** over HTTP from Nest only (`LANGUAGE_TOOL_ENABLED`).
