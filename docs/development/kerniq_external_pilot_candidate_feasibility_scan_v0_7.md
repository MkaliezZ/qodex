# KerniQ External Pilot Candidate Feasibility Scan v0.7

## Executive Decision

**EXISTING_ARCHIVE_ONLY_BLOCKER=true。** 本次目的性扫描审查 30 个公开项目，20 个有真实 LangChain 工具执行路径证据，19 个通过近期研究候选门槛；按任务定义，只有 1 个可条件计入 NATURALLY_PILOTABLE（1/20=5%）。该 1 个仍是 UNKNOWN，尚未证明存在合格 archive。确认可直接交给当前 validator 的外部 source 为 **0**。

**主要损失在 PROFILE_COMPATIBILITY。** 真实且近期的 19 个工具项目中，18 个已有事件处理或 trace 线索；其中 17 个公开路径存在明确的版本、序列化或执行范围不匹配。不能将“已有 trace”直接变成“已有冻结 profile 接受的原始 archive”。这是本样本下的工程准入瓶颈判断，不是对所有 LangChain 用户的市场占比估计。

最终建议：`DESIGN_MINIMAL_SOURCE_PREPARATION_PATH_BEFORE_SCALING_OUTREACH`。本轮只作此结论，未设计或实现 source preparation，未 outreach，未修改产品。

## Current Pilot Constraints

基线为 `8b9d1bb0b0acf9eeecd7826a08668bb84bb80bee`，报告分支从执行时最新 `origin/main` 创建。约束依据仓库的 [frozen profile](kerniq_langchain_external_profile_v0_6_2_freeze.md) 和 [internal usability rerun](kerniq_langchain_internal_usability_rerun_v0_6_4.md)。

- `INTERNAL_USABILITY_PROOF=PASS`；`CAPABILITY_CLASSIFICATION=OBSERVED`。
- `PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1`；`SOURCE_ACQUISITION_MODE=EXISTING_ARCHIVE_ONLY`。
- Python 包版本：langchain 1.4.0、langchain-core 1.6.2、langgraph 1.2.11、langgraph-prebuilt 1.1.0。
- 已存在、未过滤的 native `astream_events(version="v2")`，由指定 Core 的 `langchain_core.load.dump.dumps` 单行序列化为 UTF-8 JSONL、LF 分隔且末尾 LF。
- 一次 root invocation、一个 ordinary tool run、一个结构化成功 ToolMessage terminal；必须保留完整顺序、parent_ids、开始/终止和 source provenance。
- 缺少 exporter、版本、配置、过滤、capture scope、终止/退化信息时不能资格通过；不能从看似相同字段推导兼容。
- validator 仍是 local-only、read-only、offline；本轮不运行他人代码、不验证他人 archive、不转换 trace，也不扩大到一般 LangChain 支持。
- `EXTERNAL_VALIDATION_PROVEN=false`；`ADOPTION_PROVEN=false`。已有总的 pilot outreach 授权不覆盖本轮明确禁止发送的范围。

## Research Method

观察截止日期：2026-09-10（Asia/Shanghai）；活动表展示 GitHub default-branch HEAD 的 **UTC commit 日期**及链接。这是可复核的近期代码活动代理值，不声称每个 commit 都是人工操作，也不冒充全平台最新活动。另查到的 issue/PR 上下文单列，不能由自动 release/dependency 更新推导真人试用意愿。近期优先窗为 2026-03-10 起，放宽窗为 2025-09-10 起。

GitHub 为主，结合公开网页搜索发现候选；查询覆盖 `astream_events langchain`、`on_tool_start langchain`、`create_agent ToolMessage`、`langchain jsonl`、`langchain event run_id`、`langchain_core.load.dump`，随后检查具体仓库的执行、callback、存储和依赖代码。读取公开 repo metadata、default-branch commit、完整 tree 和选定文件；检查 fixtures/traces/events/logs/examples/testdata/recordings/snapshots/artifacts 等路径。对公开 fixture 只检查结构和序列化形态，不将 payload 复制到本仓库。部分组合搜索未返回结果，不据此宣称其他 archive 不存在。

采样粒度是 **独立项目/集成代码库**，不是经去重的自然人数；同一组织可以有不同产品（如 deepagents 与 open_deep_research），不重复计作同一 repo。候选覆盖个人项目 A、开源 agent 项目 B、框架/集成维护者 C。30 个 repo 在观察时均非 fork、非 archived，且有公开 profile/issue 入口；这不证明其真实使用均活跃。

`REAL_LANGCHAIN_TOOL_USE=true` 表示在产品或维护中的集成中找到可追溯的非空、非手工模拟 callback 的工具执行路径，并结合公开运行说明、trace 产品、演示或故障上下文；**不是本轮独立执行证明，也不等于生产客户使用**。普通算术/文件/搜索工具可成立；只有 fake model、手工 callback、模板代码或 README 名称不成立。LoopLens 的语料、OpenInference 的部分示例返回是合成的：其真实工具函数与集成可审查，生产用户数仍未知。已保留这种证据层级差异。

`QUALIFIED_CANDIDATES` 是“通过真实工具和近期证据门槛的研究候选”，不是 validator-qualified source。共 19 个，未用 11 个弱项补成 20。30 个全部完成有依据的评分，满足 stop condition A（至少 30 raw、至少 20 可评分），停止扩展搜索。

不读取私人 trace、customer data 或私有联络内容，不保存 secrets，不提交他人运行数据。历史联系人只作候选发现线索，PraisonAI 按当前公开实现重新评分。

## Funnel Definition

A/B/C/D archive 与候选类型 A/B/C 是不同维度。Archive A：公开可见已保存的 trace/fixture/run；B：明确事件/trace/export pipeline，但本轮未见可核验的已存原始 archive；C：真实工具但弱 archive 线索；D：无目标 archive 证据或当前执行路径显著不适配。A 不自动证明 fixture 来自真实 LC 运行，更不证明 frozen-profile compatibility。

Compatibility 默认 UNKNOWN。UNLIKELY 仅用于有具体的当前 source 表示、执行范围、producer 语言或版本不匹配证据；它描述**已观察路径**，不证明维护者不可能私下保存另一份 native archive。deepagents 的源码调用层与依赖下界最近，但 source/provenance 未知，保留 UNKNOWN；只作为对用户门槛的宽松计数。其默认多工具/middleware/subagent harness 不能直接提交。

版本分类：EXACT_MATCH 需四包精确证据；NEAR_MATCH 仅表示重要版本证据接近；MODERN_1_X 表示现代 Python API/依赖，不证明完整 resolved versions；UNKNOWN 为不足；INCOMPATIBLE 为显式约束排除目标或已知非 Python producer。旧版本下界 `>=0.x` 不等于锁在 0.x；LCJS 的 1.x 不能算 Python 的 MODERN_1_X。

评分采用六项：真实工具 0/2、近期 0/1/2、archive D/C/B/A=0/1/2/3、profile fit 0/1、可联系 0/1、具体真人工具问题上下文 0/1。表中列出原始六项分。全部 fit 为 0，不能给未证实适配加分。为防止 trace 丰富掩盖准入不符，明确采用保守封顶：未通过研究候选门槛最高 3；UNLIKELY 最高 5；UNKNOWN 最高 7。最终层级严格按最终分数：8–10 Tier 1，6–7 Tier 2，4–5 Tier 3，0–3 REJECT。Tier 1 为 0，Tier 2 为 1。

NATURALLY_PILOTABLE 严格采用任务给定逻辑：真实工具 + archive A/B + contact 非 NONE + compatibility 非 UNLIKELY。用户定义容许 UNKNOWN，因此本次 1 是**待 source 预核验上限**，不是现成试跑数量；如将 UNKNOWN 排除，则为 0，最终决策不变。

## Candidate Table

三个表按 RANK 连接，同一行的证据由 Sxx 源条目固定到观察时 commit。类型：A=Individual Developer，B=Open-source Agent Project，C=Framework / Integration Maintainer。候选名称中的 GitHub login 表示公开贡献角色，不推断未公开身份。PUBLIC_URL 即 repo 名称上的链接。

### Identity and activity

| RANK | CANDIDATE_NAME / ROLE | TYPE | PROJECT_OR_REPO / PUBLIC_URL | LAST_ACTIVITY_DATE (UTC commit) | SOURCE |
| --- | --- | --- | --- | --- | --- |
| 1 | Deep Agents maintainers / kowshikdev contributor | C | [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | [2026-09-09](https://github.com/langchain-ai/deepagents/commit/26954eaafb581db641dd7ce3f9d4ba470a9af878) | [S09](#s09) |
| 2 | nn70ixux / active contributor | A | [yigbt/EcoToxFred](https://github.com/yigbt/EcoToxFred) | [2026-04-20](https://github.com/yigbt/EcoToxFred/commit/e8dda4775859cb03856e1adaaa75794d5252788f) | [S21](#s21) |
| 3 | ekaterina-nikonova / replay contributor | C | [sixty-north/langchain-replay](https://github.com/sixty-north/langchain-replay) | [2026-04-17](https://github.com/sixty-north/langchain-replay/commit/92ab32f3e9154ed164023fd1ba2abdb4633af1b4) | [S01](#s01) |
| 4 | jakobtorben / contributor | B | [SINTEF-agentlab/jutul-agent](https://github.com/SINTEF-agentlab/jutul-agent) | [2026-08-14](https://github.com/SINTEF-agentlab/jutul-agent/commit/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b) | [S26](#s26) |
| 5 | DeerFlow maintainers / CorgiBoyG contributor | B | [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | [2026-09-09](https://github.com/bytedance/deer-flow/commit/0d4925305a6330a3442dcd336ed25750aea87cbd) | [S08](#s08) |
| 6 | ashutosh-rath02 / maintainer | A | [ashutosh-rath02/looplens](https://github.com/ashutosh-rath02/looplens) | [2026-07-03](https://github.com/ashutosh-rath02/looplens/commit/4f1266c3431d196df0266233940c7c8749c98a2b) | [S04](#s04) |
| 7 | kjgpta / maintainer | A | [kjgpta/tracesage](https://github.com/kjgpta/tracesage) | [2026-07-22](https://github.com/kjgpta/tracesage/commit/7dce768ec0f692188cbb1fa97cf6bb0925c9121f) | [S05](#s05) |
| 8 | Langfuse Python integration maintainers | C | [langfuse/langfuse-python](https://github.com/langfuse/langfuse-python) | [2026-09-09](https://github.com/langfuse/langfuse-python/commit/13d12d56155b335f132ddc86b1a7e4e702d6a304) | [S10](#s10) |
| 9 | OpenInference LangChain maintainers | C | [Arize-ai/openinference](https://github.com/Arize-ai/openinference) | [2026-09-09](https://github.com/Arize-ai/openinference/commit/adaf9e7e653748ce97ed093182e4ff6dc07a0443) | [S11](#s11) |
| 10 | AgentOps LangChain integration maintainers | C | [AgentOps-AI/agentops](https://github.com/AgentOps-AI/agentops) | [2026-06-25](https://github.com/AgentOps-AI/agentops/commit/f8e907b92dabe47232978023fdcb01e2a7d4b752) | [S12](#s12) |
| 11 | Langflow maintainers | B | [langflow-ai/langflow](https://github.com/langflow-ai/langflow) | [2026-09-08](https://github.com/langflow-ai/langflow/commit/595cd72a2b2021f2375fa31109af02d20bb17648) | [S13](#s13) |
| 12 | Flowise ToolAgent maintainers | B | [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) | [2026-08-13](https://github.com/FlowiseAI/Flowise/commit/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb) | [S14](#s14) |
| 13 | Open Deep Research maintainers | B | [langchain-ai/open_deep_research](https://github.com/langchain-ai/open_deep_research) | [2026-08-10](https://github.com/langchain-ai/open_deep_research/commit/1b7d2e80db9faa586165c60e09096dbbfd483a64) | [S15](#s15) |
| 14 | MervinPraison / maintainer | C | [MervinPraison/PraisonAI](https://github.com/MervinPraison/PraisonAI) | [2026-09-08](https://github.com/MervinPraison/PraisonAI/commit/0bde2ecfc2950a983fd502c4788458c6fbdae81c) | [S17](#s17) |
| 15 | GraphARC harness maintainers | C | [CodeGraphContext/GraphARC](https://github.com/CodeGraphContext/GraphARC) | [2026-08-13](https://github.com/CodeGraphContext/GraphARC/commit/cf984f776c3f8c98153a723facfd870341e35dc5) | [S19](#s19) |
| 16 | mirasoth / NoeAgent maintainer | B | [mirasoth/noesium](https://github.com/mirasoth/noesium) | [2026-06-01](https://github.com/mirasoth/noesium/commit/e9ed0e6f8e312dbdd696ca93412a487e39d83469) | [S20](#s20) |
| 17 | skygazer42 / maintainer | A | [skygazer42/Weaver](https://github.com/skygazer42/Weaver) | [2026-04-09](https://github.com/skygazer42/Weaver/commit/745693afbf1e8a5b68dad5f616b2681cb2042ee9) | [S22](#s22) |
| 18 | Quantum Calibration blueprint maintainers | B | [NVIDIA/Quantum-Calibration-Agent-Blueprint](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint) | [2026-07-30](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/commit/d8d37bc4de28d2347d8e21405903b29a2891f793) | [S25](#s25) |
| 19 | Abdelrahman-Kanakri / maintainer | A | [Abdelrahman-Kanakri/Personal_Search_Assistant](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant) | [2026-07-21](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/commit/d926644bf5dd0962c62ee9eea0b06f785bff02f7) | [S27](#s27) |
| 20 | ManasVardhan / maintainer | A | [ManasVardhan/agent-replay](https://github.com/ManasVardhan/agent-replay) | [2026-09-06](https://github.com/ManasVardhan/agent-replay/commit/ba777a70c629c07542f7e7a050a5885fbd382276) | [S02](#s02) |
| 21 | SGcpu / maintainer | A | [SGcpu/AeroGraph](https://github.com/SGcpu/AeroGraph) | [2026-07-23](https://github.com/SGcpu/AeroGraph/commit/8065eae6d9e557ca2b707569d5e37e8089e0ae7c) | [S03](#s03) |
| 22 | Siddhant-K-code / maintainer | A | [Siddhant-K-code/agent-trace](https://github.com/Siddhant-K-code/agent-trace) | [2026-08-22](https://github.com/Siddhant-K-code/agent-trace/commit/b109ec5b3714b842746e97ee8e975329d8582667) | [S06](#s06) |
| 23 | rajudandigam / maintainer | A | [rajudandigam/agent-inspect](https://github.com/rajudandigam/agent-inspect) | [2026-09-06](https://github.com/rajudandigam/agent-inspect/commit/33faf08297d7667752d656e37b20a60f6718971e) | [S07](#s07) |
| 24 | Graphiti maintainers | B | [getzep/graphiti](https://github.com/getzep/graphiti) | [2026-09-09](https://github.com/getzep/graphiti/commit/6a412ae150b869c1b64fa06c33ac7325467d6301) | [S16](#s16) |
| 25 | Cheshire Cat core maintainers | B | [cheshire-cat-ai/core](https://github.com/cheshire-cat-ai/core) | [2026-07-29](https://github.com/cheshire-cat-ai/core/commit/1493ce31301c4e6f14008d5e410ff7dcc3654eb7) | [S18](#s18) |
| 26 | lointain / maintainer | C | [lointain/langchain_aisdk_adapter](https://github.com/lointain/langchain_aisdk_adapter) | [2025-08-14](https://github.com/lointain/langchain_aisdk_adapter/commit/db81f7588e1811b2f34c113e1ef251403c3a5f26) | [S24](#s24) |
| 27 | EpisodeYu / maintainer | A | [EpisodeYu/3GPP-Everything](https://github.com/EpisodeYu/3GPP-Everything) | [2026-08-13](https://github.com/EpisodeYu/3GPP-Everything/commit/ca5bd231304facd7110ce519f01777a7065a99f0) | [S28](#s28) |
| 28 | zhajiahe / maintainer | A | [zhajiahe/deepagentschat](https://github.com/zhajiahe/deepagentschat) | [2025-11-19](https://github.com/zhajiahe/deepagentschat/commit/4c15520c57d5b9541769bc0d87feae75d710b299) | [S23](#s23) |
| 29 | NicholasGoh / maintainer | A | [NicholasGoh/fastapi-mcp-langgraph-template](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template) | [2025-06-13](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template/commit/2bd004a51e5d741e8eaf5bb01716b6a673684a53) | [S29](#s29) |
| 30 | sheikhhanif / maintainer | A | [sheikhhanif/LangGraph_Streaming](https://github.com/sheikhhanif/LangGraph_Streaming) | [2024-07-08](https://github.com/sheikhhanif/LangGraph_Streaming/commit/098873f926aaada6715da062897b29a2e914b841) | [S30](#s30) |

### Execution and event evidence

| RANK | LANGCHAIN_USE_EVIDENCE | TOOL_CALLING_EVIDENCE | EVENT_TRACE_EVIDENCE | REAL_LANGCHAIN_TOOL_USE | PUBLIC_EVENT_FIXTURE_FOUND |
| --- | --- | --- | --- | --- | --- |
| 1 | 核心 graph 使用 create_agent [S09](#s09) | 文件工具及 tool_call_id offload bug 修复，真实产品路径 | CLI tracing 配置存在；未发现可核验的原始事件 archive | true | false |
| 2 | create_agent + astream_events(version=v2) [S21](#s21) | 科研 agent 的检索工具、公开部署与工具 issue | agent.py 消费 native v2 并按事件类别输出 | true | false |
| 3 | create_agent + WriteFileTool 的 record/replay 集成 [S01](#s01) | 真实文件工具执行路径；README 展示 live model 调用 | recorder 将事件折叠为 turn JSONL，ToolMessage 仅保留内容 | true | false |
| 4 | deepagents builder 与 AgentMiddleware [S26](#s26) | Julia 科学计算 agent 的工具包装调用 | 每会话 SQLite trace；字段 timestamp/kind/payload_json | true | false |
| 5 | LangChain 模型与 agent harness；原生 callback 接入 [S08](#s08) | 文件及其他工具、运行状态与 teardown 修复上下文 | RunJournal 自定义 envelope；JSONL store；公开 replay fixture | true | true |
| 6 | ChatOpenAI + create_react_agent [S04](#s04) | search 工具执行小型本地 corpus 查询；非手工 callback 模拟 | LangGraph handler 映射自定义事件；sample_run.jsonl 已保存 | true | true |
| 7 | AgentExecutor + create_tool_calling_agent [S05](#s05) | web research showcase 用真实模型与 DuckDuckGoSearchRun | LC adapter 转 RawEvents 并经队列记录 | true | false |
| 8 | 官方 LC CallbackHandler 支持 v1 分支 [S10](#s10) | tool start/end hooks 与已发布 tracing 集成 | callback 导出 OTEL/观测 span | true | false |
| 9 | Python langchain_v1_agent 示例用 create_agent [S11](#s11) | calculate 执行真实算术；天气/搜索示例为合成返回 | OTLPSpanExporter / ConsoleSpanExporter | true | false |
| 10 | AgentExecutor + create_openai_tools_agent [S12](#s12) | langchain_examples.py 使用真实模型和 @tool | LC callbacks 映射 tracing span | true | false |
| 11 | single_tool_call_middleware 使用 create_agent [S13](#s13) | 产品 agent component 有实际工具调用路径 | NativeTracer 按 run_id 收集 span | true | false |
| 12 | LCJS ToolAgent / executor.invoke [S14](#s14) | 工具节点与执行器属于实际产品 | ConsoleCallbackHandler 等 callback pipeline | true | false |
| 13 | LangGraph StateGraph + bind_tools [S15](#s15) | 研究工具、ToolMessage、多 agent orchestration | README 链接公开 benchmark LangSmith runs | true | false |
| 14 | 导入 LC community 的 YouTube/Wikipedia 工具 [S17](#s17) | 真实 LC 工具由 Praison 自有 agent loop 调用 | 所查 LangChain bridge 未发现对应原始事件 archive | true | false |
| 15 | BaseChatModel / bind_tools / ToolMessage [S19](#s19) | 自有 AgentNode 提供模型和工具执行路径 | TraceRecorder 将自有 TraceEvent 写 JSONL | true | false |
| 16 | NoeAgent tool_node 使用 ToolMessage [S20](#s20) | registry 驱动真实工具执行 | 默认 session progress JSONL；文档 astream_events 指自身 ProgressEvent | true | false |
| 17 | LangChain / LangGraph >=1；原生 v2 stream [S22](#s22) | 可运行 agent 平台及工具调用路径 | v2 转 Vercel AI stream；自定义内存 tracing/OTLP | true | false |
| 18 | deepagents + LC tool decorators [S25](#s25) | lab_tool 用于实际校准工作流/模拟路径 | CLI 消费 astream_events 并显示 tool start/end | true | false |
| 19 | LangGraph 节点使用 bind_tools；LC>=1.3.11 [S27](#s27) | 搜索工具和 HITL 工作流 | v2 loop 只转发 tokens/interrupt/done | true | false |
| 20 | BaseCallbackHandler 集成存在 [S02](#s02) | 只有 adapter hooks，未找到足够的非 mock LC 工具运行证据 | finish(trace.jsonl) 写自定义 span/trace | false | false |
| 21 | Python LC callback adapter；JS 依赖另列 [S03](#s03) | 已检查 Python demo 使用 fake model，真实工具证据不足 | 公开 JSON fixture 包装为 description/fixtures；自定义 Aero event | false | true |
| 22 | BaseTool / BaseChatModel instrumentation [S06](#s06) | 未验证非 mock LC agent 实际调用；不能由 monkeypatch 推导 | 公开 hiring trace.ndjson；事件为 event_type/data/sequence | false | true |
| 23 | TypeScript @langchain/core adapter [S07](#s07) | 检查的 LangChain 示例手工触发 callbacks，非真实工具运行证据 | 公开 swarm evidence/trace.jsonl；camelCase runId schema | false | true |
| 24 | 本轮检查未建立 LC agent 主执行路径 [S16](#s16) | 图数据库/记忆库能力不能代替 LC tool run 证明 | OTel 文档描述图库 tracing | false | false |
| 25 | 当前依赖与 agent 基类未建立 LC agent 使用证据 [S18](#s18) | 当前自有 list_tools/call_tool 不能视为 LC tools | 未找到目标 LC 原始事件保存路径 | false | false |
| 26 | LangGraph ReAct 到 AI SDK 适配 [S24](#s24) | 公开 stream_text 示例有 agent tools | 示例将 message parts 保存为 JSON | true | false |
| 27 | LC core message types 与 LangGraph 依赖 [S28](#s28) | LiteLLM/自定义 dispatcher；未建立目标 LC agent/tool run 证据 | 有自定义运行/观测路径，未见目标 archive | false | false |
| 28 | FastAPI + deepagents 模板依赖 LC>=1.0.5 [S23](#s23) | 本轮未见足够非模板真实工具运行证据 | changelog token streaming，不证明 archive | false | false |
| 29 | create_react_agent 与 MCP StructuredTool 模板 [S29](#s29) | 模板代码不能证明近期真实工具使用 | 未建立真实保存运行证据 | false | false |
| 30 | LangGraph streaming 教程 [S30](#s30) | 未建立非教程、近期真实工具运行证据 | streaming 教程不证明 retained archive | false | false |

### Qualification and priority

CONTACT_PATH 的 GITHUB_ISSUE 表示已启用的公开 repo issue 入口（不代表允许无关推广）；实际 shortlist 优先公开贡献者 profile。分数写作“六项原分 → 封顶后分数”。

| RANK | QUALIFIED | ARCHIVE_LIKELIHOOD | PROFILE_COMPATIBILITY | VERSION_EVIDENCE | CONTACT_PATH | CANDIDATE_SCORE | TIER | WHY_GOOD_FIT | MAIN_RISK |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | true | B | UNKNOWN | NEAR_MATCH | [GITHUB_ISSUE](https://github.com/langchain-ai/deepagents/issues) | 2+2+2+0+1+1 → 7 | TIER_2_GOOD_PROSPECT | LC/core 下界恰为 1.4.0/1.6.2，且有真人工具故障上下文 | 范围不是四包精确 pins；middleware/subagents 默认不符单根普通工具边界 |
| 2 | true | B | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/yigbt/EcoToxFred/issues) | 2+2+2+0+1+1 → 5 | TIER_3_WEAK_PROSPECT | 小型实际应用且有人讨论 CypherSearchTool | 四包 pins 为 1.2.6/1.2.7/1.0.6/1.0.6；未见完整 archive writer |
| 3 | true | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/sixty-north/langchain-replay/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 同一工具在录制和回放中执行，问题与执行证据接近 | 现有 writer 丢失原始 envelope 和 typed ToolMessage；core>=0.3 不是版本锁 |
| 4 | true | B | UNLIKELY | MODERN_1_X | [GITHUB_ISSUE](https://github.com/SINTEF-agentlab/jutul-agent/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 小型科研工程项目已将 trace 作为工作流 | middleware 转换后的 SQLite 不能当作 raw v2 JSONL |
| 5 | true | A | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/bytedance/deer-flow/issues) | 2+2+3+0+1+1 → 5 | TIER_3_WEAK_PROSPECT | 真实复杂工具运行有调试需求 | 多层 harness 与自定义序列化；fixture 为 JSON wrapper，非 raw v2 |
| 6 | true | A | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/ashutosh-rath02/looplens/issues) | 2+2+3+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 循环工具调用调试与运行结果解释相关 | 示例语料是合成的，不是生产使用证明；fixture 不是 native event |
| 7 | true | B | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/kjgpta/tracesage/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 已有 agent 调试和 trace 产品路径 | langchain extra 的 core<1.5.0 排除 1.6.2；记录经过转换 |
| 8 | true | B | UNLIKELY | MODERN_1_X | [GITHUB_ISSUE](https://github.com/langfuse/langfuse-python/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 工具调用 tracing 是直接维护职责 | span 不等于未过滤 v2 事件；未见 dump.dumps archive |
| 9 | true | B | UNLIKELY | MODERN_1_X | [GITHUB_ISSUE](https://github.com/Arize-ai/openinference/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 可解释工具跨度和运行关联 | OTel span 非 raw source；示例含合成工具，不能当生产用户证明 |
| 10 | true | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/AgentOps-AI/agentops/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 工具生命周期观测与错误解释相关 | classic agent 路径及自定义 callback span，非 raw v2 source |
| 11 | true | B | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/langflow-ai/langflow/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 单工具调用与原生 tracing 都能定位 | langchain~=1.3.0 排除 1.4.0；middleware/span schema 不符 |
| 12 | true | B | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/FlowiseAI/Flowise/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 真实 agent 平台的工具调试上下文 | TypeScript/LCJS source 不符合 Python dump.dumps profile |
| 13 | true | A | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/langchain-ai/open_deep_research/issues) | 2+2+3+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 可见保存后的研究运行和工具结果 | LangSmith 视图不是 raw JSONL；复杂图和嵌套执行不符窄 profile |
| 14 | true | D | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/MervinPraison/PraisonAI/issues) | 2+2+0+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | LC 工具复用可比较 runtime 边界 | 自有执行循环不是 LC create_agent；历史接触不提高当前适配评分 |
| 15 | true | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/CodeGraphContext/GraphARC/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 图节点与工具结果追踪相关 | 自定义图及序列化会改变原生事件；旧下界不证明 exact 版本 |
| 16 | true | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/mirasoth/noesium/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 已有本地会话日志 | 同名 astream_events 不能证明原生 v2；保存的是 progress schema |
| 17 | true | B | UNLIKELY | MODERN_1_X | [GITHUB_ISSUE](https://github.com/skygazer42/Weaver/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 已有事件处理和调试 UI | 输出转换及非持久 store 不构成冻结 archive |
| 18 | true | B | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 工具状态和科学计算运行有实际解释需求 | core==1.3.0、deepagents==0.5.3；CLI 展示/截断不是原始 archive |
| 19 | true | B | UNLIKELY | MODERN_1_X | [GITHUB_ISSUE](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/issues) | 2+2+2+0+1+0 → 5 | TIER_3_WEAK_PROSPECT | 有具体研究工具运行路径及流事件代码 | 过滤原始事件，HITL/custom graph 不符窄 profile |
| 20 | false | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/ManasVardhan/agent-replay/issues) | 0+2+2+0+1+0 → 3 | REJECT | 本地记录与回放需求相关 | 未通过真实工具门槛；自定义 schema、字符串截断 |
| 21 | false | A | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/SGcpu/AeroGraph/issues) | 0+2+3+0+1+0 → 3 | REJECT | 能定位事件存储和适配层 | fixture 不是 raw v2 JSONL；JS 1.x 不能证明 Python 版本 |
| 22 | false | A | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/Siddhant-K-code/agent-trace/issues) | 0+2+3+0+1+0 → 3 | REJECT | 本地 NDJSON 和事件健康检查相关 | 公开样本与 LC 执行的关联未证实；自定义格式和截断 |
| 23 | false | A | UNLIKELY | INCOMPATIBLE | [GITHUB_ISSUE](https://github.com/rajudandigam/agent-inspect/issues) | 0+2+3+0+1+0 → 3 | REJECT | 关注工具错误与恢复状态的调试 | 示例不足以证明真实 LC tools；JS producer 非冻结 Python profile |
| 24 | false | D | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/getzep/graphiti/issues) | 0+2+0+0+1+0 → 3 | REJECT | 公开运行观测存在，可用于边界比较 | 无目标 LC agent 证据；不因 tracing 或热度纳入 |
| 25 | false | D | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/cheshire-cat-ai/core/issues) | 0+2+0+0+1+0 → 3 | REJECT | 有真实 agent 产品，可检验历史标签漂移 | 不能把历史 LangChain 印象当成当前实现证据 |
| 26 | false | B | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/lointain/langchain_aisdk_adapter/issues) | 2+0+2+0+1+0 → 3 | REJECT | 明确事件转换与落盘逻辑 | 末次 default-branch commit 超过 12 月；保存的是 UI parts |
| 27 | false | D | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/EpisodeYu/3GPP-Everything/issues) | 0+2+0+0+1+0 → 3 | REJECT | 技术研究场景但需先过真实 LC 门槛 | RAG/custom tool engine 不能仅凭 ToolMessage 算 qualified |
| 28 | false | D | UNKNOWN | MODERN_1_X | [GITHUB_ISSUE](https://github.com/zhajiahe/deepagentschat/issues) | 0+1+0+0+1+0 → 2 | REJECT | 现代版本可作弱对照 | 模板排除；不能从 deepagents 名称推导实际 tools 或 archive |
| 29 | false | D | UNLIKELY | UNKNOWN | [GITHUB_ISSUE](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template/issues) | 0+0+0+0+1+0 → 1 | REJECT | agent 编排模式可定位 | 纯模板、MCP 边界，且最后 commit 超过 12 月 |
| 30 | false | D | UNKNOWN | UNKNOWN | [GITHUB_ISSUE](https://github.com/sheikhhanif/LangGraph_Streaming/issues) | 0+0+0+0+1+0 → 1 | REJECT | 作为 tutorial 排除对照 | 2024 年活动，教程而非现成外部 pilot |

### Source ledger

每个 Sxx 的代码、依赖和文档链接均固定到上述 commit。未检索到公开原始 archive 只是本次检查结果。PUBLIC_EVENT_FIXTURE_FOUND=false 不表示项目没有任何 fixture；open_deep_research 的公开 LangSmith runs 支撑 archive A，但未检出相应公开原始 event fixture，故该字段仍 false。

<a id="s01"></a>

**S01 — sixty-north/langchain-replay**

[src/langchain_replay/recorder.py](https://github.com/sixty-north/langchain-replay/blob/92ab32f3e9154ed164023fd1ba2abdb4633af1b4/src/langchain_replay/recorder.py) · [pyproject.toml](https://github.com/sixty-north/langchain-replay/blob/92ab32f3e9154ed164023fd1ba2abdb4633af1b4/pyproject.toml) · [README.md](https://github.com/sixty-north/langchain-replay/blob/92ab32f3e9154ed164023fd1ba2abdb4633af1b4/README.md)

<a id="s02"></a>

**S02 — ManasVardhan/agent-replay**

[src/agent_replay/integrations/langchain.py](https://github.com/ManasVardhan/agent-replay/blob/ba777a70c629c07542f7e7a050a5885fbd382276/src/agent_replay/integrations/langchain.py) · [src/agent_replay/recorder.py](https://github.com/ManasVardhan/agent-replay/blob/ba777a70c629c07542f7e7a050a5885fbd382276/src/agent_replay/recorder.py) · [pyproject.toml](https://github.com/ManasVardhan/agent-replay/blob/ba777a70c629c07542f7e7a050a5885fbd382276/pyproject.toml)

<a id="s03"></a>

**S03 — SGcpu/AeroGraph**

[python/aerograph-langchain/src/aerograph_langchain/handler.py](https://github.com/SGcpu/AeroGraph/blob/8065eae6d9e557ca2b707569d5e37e8089e0ae7c/python/aerograph-langchain/src/aerograph_langchain/handler.py) · [python/aerograph-langchain/examples/langchain_demo.py](https://github.com/SGcpu/AeroGraph/blob/8065eae6d9e557ca2b707569d5e37e8089e0ae7c/python/aerograph-langchain/examples/langchain_demo.py) · [python/aerograph-langchain/pyproject.toml](https://github.com/SGcpu/AeroGraph/blob/8065eae6d9e557ca2b707569d5e37e8089e0ae7c/python/aerograph-langchain/pyproject.toml) · [python/aerograph-langchain/tests/fixtures/langchain_run.json](https://github.com/SGcpu/AeroGraph/blob/8065eae6d9e557ca2b707569d5e37e8089e0ae7c/python/aerograph-langchain/tests/fixtures/langchain_run.json)

<a id="s04"></a>

**S04 — ashutosh-rath02/looplens**

[examples/langgraph_agent.py](https://github.com/ashutosh-rath02/looplens/blob/4f1266c3431d196df0266233940c7c8749c98a2b/examples/langgraph_agent.py) · [looplens/integrations/langgraph.py](https://github.com/ashutosh-rath02/looplens/blob/4f1266c3431d196df0266233940c7c8749c98a2b/looplens/integrations/langgraph.py) · [traces/sample_run.jsonl](https://github.com/ashutosh-rath02/looplens/blob/4f1266c3431d196df0266233940c7c8749c98a2b/traces/sample_run.jsonl) · [pyproject.toml](https://github.com/ashutosh-rath02/looplens/blob/4f1266c3431d196df0266233940c7c8749c98a2b/pyproject.toml)

<a id="s05"></a>

**S05 — kjgpta/tracesage**

[examples/showcase/02_web_research_agent/after.py](https://github.com/kjgpta/tracesage/blob/7dce768ec0f692188cbb1fa97cf6bb0925c9121f/examples/showcase/02_web_research_agent/after.py) · [src/tracesage/adapters/langchain.py](https://github.com/kjgpta/tracesage/blob/7dce768ec0f692188cbb1fa97cf6bb0925c9121f/src/tracesage/adapters/langchain.py) · [pyproject.toml](https://github.com/kjgpta/tracesage/blob/7dce768ec0f692188cbb1fa97cf6bb0925c9121f/pyproject.toml)

<a id="s06"></a>

**S06 — Siddhant-K-code/agent-trace**

[src/agent_trace/integrations/langchain.py](https://github.com/Siddhant-K-code/agent-trace/blob/b109ec5b3714b842746e97ee8e975329d8582667/src/agent_trace/integrations/langchain.py) · [ADRs/0002-ndjson-file-storage-no-database.md](https://github.com/Siddhant-K-code/agent-trace/blob/b109ec5b3714b842746e97ee8e975329d8582667/ADRs/0002-ndjson-file-storage-no-database.md) · [examples/hiring/example-submission/trace.ndjson](https://github.com/Siddhant-K-code/agent-trace/blob/b109ec5b3714b842746e97ee8e975329d8582667/examples/hiring/example-submission/trace.ndjson) · [pyproject.toml](https://github.com/Siddhant-K-code/agent-trace/blob/b109ec5b3714b842746e97ee8e975329d8582667/pyproject.toml)

<a id="s07"></a>

**S07 — rajudandigam/agent-inspect**

[examples/08-langchain-adapter/src/index.ts](https://github.com/rajudandigam/agent-inspect/blob/33faf08297d7667752d656e37b20a60f6718971e/examples/08-langchain-adapter/src/index.ts) · [examples/08-langchain-adapter/package.json](https://github.com/rajudandigam/agent-inspect/blob/33faf08297d7667752d656e37b20a60f6718971e/examples/08-langchain-adapter/package.json) · [examples/evidence/langgraph-swarm/evidence/trace.jsonl](https://github.com/rajudandigam/agent-inspect/blob/33faf08297d7667752d656e37b20a60f6718971e/examples/evidence/langgraph-swarm/evidence/trace.jsonl) · [README.md](https://github.com/rajudandigam/agent-inspect/blob/33faf08297d7667752d656e37b20a60f6718971e/README.md)

<a id="s08"></a>

**S08 — bytedance/deer-flow**

[README.md](https://github.com/bytedance/deer-flow/blob/0d4925305a6330a3442dcd336ed25750aea87cbd/README.md) · [backend/docs/RUN_EVENT_STREAM.md](https://github.com/bytedance/deer-flow/blob/0d4925305a6330a3442dcd336ed25750aea87cbd/backend/docs/RUN_EVENT_STREAM.md) · [backend/packages/harness/deerflow/runtime/events/store/jsonl.py](https://github.com/bytedance/deer-flow/blob/0d4925305a6330a3442dcd336ed25750aea87cbd/backend/packages/harness/deerflow/runtime/events/store/jsonl.py) · [backend/tests/fixtures/replay/write_read_file.ultra.events.json](https://github.com/bytedance/deer-flow/blob/0d4925305a6330a3442dcd336ed25750aea87cbd/backend/tests/fixtures/replay/write_read_file.ultra.events.json)

<a id="s09"></a>

**S09 — langchain-ai/deepagents**

[libs/deepagents/deepagents/graph.py](https://github.com/langchain-ai/deepagents/blob/26954eaafb581db641dd7ce3f9d4ba470a9af878/libs/deepagents/deepagents/graph.py) · [libs/deepagents/pyproject.toml](https://github.com/langchain-ai/deepagents/blob/26954eaafb581db641dd7ce3f9d4ba470a9af878/libs/deepagents/pyproject.toml) · [libs/code/deepagents_code/_tracing.py](https://github.com/langchain-ai/deepagents/blob/26954eaafb581db641dd7ce3f9d4ba470a9af878/libs/code/deepagents_code/_tracing.py) · [README.md](https://github.com/langchain-ai/deepagents/blob/26954eaafb581db641dd7ce3f9d4ba470a9af878/README.md)

<a id="s10"></a>

**S10 — langfuse/langfuse-python**

[langfuse/langchain/CallbackHandler.py](https://github.com/langfuse/langfuse-python/blob/13d12d56155b335f132ddc86b1a7e4e702d6a304/langfuse/langchain/CallbackHandler.py) · [pyproject.toml](https://github.com/langfuse/langfuse-python/blob/13d12d56155b335f132ddc86b1a7e4e702d6a304/pyproject.toml) · [README.md](https://github.com/langfuse/langfuse-python/blob/13d12d56155b335f132ddc86b1a7e4e702d6a304/README.md)

<a id="s11"></a>

**S11 — Arize-ai/openinference**

[python/instrumentation/openinference-instrumentation-langchain/examples/langchain_v1_agent.py](https://github.com/Arize-ai/openinference/blob/adaf9e7e653748ce97ed093182e4ff6dc07a0443/python/instrumentation/openinference-instrumentation-langchain/examples/langchain_v1_agent.py) · [README.md](https://github.com/Arize-ai/openinference/blob/adaf9e7e653748ce97ed093182e4ff6dc07a0443/README.md)

<a id="s12"></a>

**S12 — AgentOps-AI/agentops**

[examples/langchain/langchain_examples.py](https://github.com/AgentOps-AI/agentops/blob/f8e907b92dabe47232978023fdcb01e2a7d4b752/examples/langchain/langchain_examples.py) · [agentops/integration/callbacks/langchain/callback.py](https://github.com/AgentOps-AI/agentops/blob/f8e907b92dabe47232978023fdcb01e2a7d4b752/agentops/integration/callbacks/langchain/callback.py) · [pyproject.toml](https://github.com/AgentOps-AI/agentops/blob/f8e907b92dabe47232978023fdcb01e2a7d4b752/pyproject.toml)

<a id="s13"></a>

**S13 — langflow-ai/langflow**

[src/lfx/src/lfx/components/models_and_agents/agent_helpers/single_tool_call_middleware.py](https://github.com/langflow-ai/langflow/blob/595cd72a2b2021f2375fa31109af02d20bb17648/src/lfx/src/lfx/components/models_and_agents/agent_helpers/single_tool_call_middleware.py) · [src/backend/base/langflow/services/tracing/native_callback.py](https://github.com/langflow-ai/langflow/blob/595cd72a2b2021f2375fa31109af02d20bb17648/src/backend/base/langflow/services/tracing/native_callback.py) · [src/backend/base/pyproject.toml](https://github.com/langflow-ai/langflow/blob/595cd72a2b2021f2375fa31109af02d20bb17648/src/backend/base/pyproject.toml)

<a id="s14"></a>

**S14 — FlowiseAI/Flowise**

[packages/components/nodes/agents/ToolAgent/ToolAgent.ts](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/components/nodes/agents/ToolAgent/ToolAgent.ts) · [packages/components/package.json](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/components/package.json) · [README.md](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/README.md)

<a id="s15"></a>

**S15 — langchain-ai/open_deep_research**

[src/open_deep_research/deep_researcher.py](https://github.com/langchain-ai/open_deep_research/blob/1b7d2e80db9faa586165c60e09096dbbfd483a64/src/open_deep_research/deep_researcher.py) · [README.md](https://github.com/langchain-ai/open_deep_research/blob/1b7d2e80db9faa586165c60e09096dbbfd483a64/README.md) · [pyproject.toml](https://github.com/langchain-ai/open_deep_research/blob/1b7d2e80db9faa586165c60e09096dbbfd483a64/pyproject.toml)

<a id="s16"></a>

**S16 — getzep/graphiti**

[README.md](https://github.com/getzep/graphiti/blob/6a412ae150b869c1b64fa06c33ac7325467d6301/README.md) · [OTEL_TRACING.md](https://github.com/getzep/graphiti/blob/6a412ae150b869c1b64fa06c33ac7325467d6301/OTEL_TRACING.md) · [pyproject.toml](https://github.com/getzep/graphiti/blob/6a412ae150b869c1b64fa06c33ac7325467d6301/pyproject.toml)

<a id="s17"></a>

**S17 — MervinPraison/PraisonAI**

[src/praisonai-agents/langchain_example.py](https://github.com/MervinPraison/PraisonAI/blob/0bde2ecfc2950a983fd502c4788458c6fbdae81c/src/praisonai-agents/langchain_example.py) · [README.md](https://github.com/MervinPraison/PraisonAI/blob/0bde2ecfc2950a983fd502c4788458c6fbdae81c/README.md)

<a id="s18"></a>

**S18 — cheshire-cat-ai/core**

[pyproject.toml](https://github.com/cheshire-cat-ai/core/blob/1493ce31301c4e6f14008d5e410ff7dcc3654eb7/pyproject.toml) · [src/cat/services/agents/base.py](https://github.com/cheshire-cat-ai/core/blob/1493ce31301c4e6f14008d5e410ff7dcc3654eb7/src/cat/services/agents/base.py) · [src/cat/services/agents/default.py](https://github.com/cheshire-cat-ai/core/blob/1493ce31301c4e6f14008d5e410ff7dcc3654eb7/src/cat/services/agents/default.py)

<a id="s19"></a>

**S19 — CodeGraphContext/GraphARC**

[grapharc/harness/agent.py](https://github.com/CodeGraphContext/GraphARC/blob/cf984f776c3f8c98153a723facfd870341e35dc5/grapharc/harness/agent.py) · [grapharc/observe/trace.py](https://github.com/CodeGraphContext/GraphARC/blob/cf984f776c3f8c98153a723facfd870341e35dc5/grapharc/observe/trace.py) · [pyproject.toml](https://github.com/CodeGraphContext/GraphARC/blob/cf984f776c3f8c98153a723facfd870341e35dc5/pyproject.toml) · [README.md](https://github.com/CodeGraphContext/GraphARC/blob/cf984f776c3f8c98153a723facfd870341e35dc5/README.md)

<a id="s20"></a>

**S20 — mirasoth/noesium**

[noeagent/src/noeagent/graph/nodes.py](https://github.com/mirasoth/noesium/blob/e9ed0e6f8e312dbdd696ca93412a487e39d83469/noeagent/src/noeagent/graph/nodes.py) · [noeagent/src/noeagent/session_log.py](https://github.com/mirasoth/noesium/blob/e9ed0e6f8e312dbdd696ca93412a487e39d83469/noeagent/src/noeagent/session_log.py) · [docs/user_guides/quick_guide_noeagent.md](https://github.com/mirasoth/noesium/blob/e9ed0e6f8e312dbdd696ca93412a487e39d83469/docs/user_guides/quick_guide_noeagent.md) · [noeagent/pyproject.toml](https://github.com/mirasoth/noesium/blob/e9ed0e6f8e312dbdd696ca93412a487e39d83469/noeagent/pyproject.toml)

<a id="s21"></a>

**S21 — yigbt/EcoToxFred**

[agent.py](https://github.com/yigbt/EcoToxFred/blob/e8dda4775859cb03856e1adaaa75794d5252788f/agent.py) · [requirements.txt](https://github.com/yigbt/EcoToxFred/blob/e8dda4775859cb03856e1adaaa75794d5252788f/requirements.txt) · [README.md](https://github.com/yigbt/EcoToxFred/blob/e8dda4775859cb03856e1adaaa75794d5252788f/README.md)

<a id="s22"></a>

**S22 — skygazer42/Weaver**

[main.py](https://github.com/skygazer42/Weaver/blob/745693afbf1e8a5b68dad5f616b2681cb2042ee9/main.py) · [common/tracing.py](https://github.com/skygazer42/Weaver/blob/745693afbf1e8a5b68dad5f616b2681cb2042ee9/common/tracing.py) · [requirements.txt](https://github.com/skygazer42/Weaver/blob/745693afbf1e8a5b68dad5f616b2681cb2042ee9/requirements.txt) · [README.md](https://github.com/skygazer42/Weaver/blob/745693afbf1e8a5b68dad5f616b2681cb2042ee9/README.md)

<a id="s23"></a>

**S23 — zhajiahe/deepagentschat**

[README.md](https://github.com/zhajiahe/deepagentschat/blob/4c15520c57d5b9541769bc0d87feae75d710b299/README.md) · [CHANGELOG.md](https://github.com/zhajiahe/deepagentschat/blob/4c15520c57d5b9541769bc0d87feae75d710b299/CHANGELOG.md) · [pyproject.toml](https://github.com/zhajiahe/deepagentschat/blob/4c15520c57d5b9541769bc0d87feae75d710b299/pyproject.toml)

<a id="s24"></a>

**S24 — lointain/langchain_aisdk_adapter**

[examples/stream_text_langgraph_example.py](https://github.com/lointain/langchain_aisdk_adapter/blob/db81f7588e1811b2f34c113e1ef251403c3a5f26/examples/stream_text_langgraph_example.py) · [pyproject.toml](https://github.com/lointain/langchain_aisdk_adapter/blob/db81f7588e1811b2f34c113e1ef251403c3a5f26/pyproject.toml) · [README.md](https://github.com/lointain/langchain_aisdk_adapter/blob/db81f7588e1811b2f34c113e1ef251403c3a5f26/README.md)

<a id="s25"></a>

**S25 — NVIDIA/Quantum-Calibration-Agent-Blueprint**

[cli.py](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/blob/d8d37bc4de28d2347d8e21405903b29a2891f793/cli.py) · [tools/lab_tool.py](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/blob/d8d37bc4de28d2347d8e21405903b29a2891f793/tools/lab_tool.py) · [pyproject.toml](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/blob/d8d37bc4de28d2347d8e21405903b29a2891f793/pyproject.toml) · [README.md](https://github.com/NVIDIA/Quantum-Calibration-Agent-Blueprint/blob/d8d37bc4de28d2347d8e21405903b29a2891f793/README.md)

<a id="s26"></a>

**S26 — SINTEF-agentlab/jutul-agent**

[src/jutul_agent/agent/builder.py](https://github.com/SINTEF-agentlab/jutul-agent/blob/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b/src/jutul_agent/agent/builder.py) · [src/jutul_agent/trace/recorder.py](https://github.com/SINTEF-agentlab/jutul-agent/blob/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b/src/jutul_agent/trace/recorder.py) · [docs/trace.md](https://github.com/SINTEF-agentlab/jutul-agent/blob/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b/docs/trace.md) · [pyproject.toml](https://github.com/SINTEF-agentlab/jutul-agent/blob/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b/pyproject.toml) · [README.md](https://github.com/SINTEF-agentlab/jutul-agent/blob/a87af2dfe00d1e2d1e6cff726ede77f84d7cb71b/README.md)

<a id="s27"></a>

**S27 — Abdelrahman-Kanakri/Personal_Search_Assistant**

[app/graph/nodes.py](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/blob/d926644bf5dd0962c62ee9eea0b06f785bff02f7/app/graph/nodes.py) · [app/streaming/events.py](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/blob/d926644bf5dd0962c62ee9eea0b06f785bff02f7/app/streaming/events.py) · [pyproject.toml](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/blob/d926644bf5dd0962c62ee9eea0b06f785bff02f7/pyproject.toml) · [README.md](https://github.com/Abdelrahman-Kanakri/Personal_Search_Assistant/blob/d926644bf5dd0962c62ee9eea0b06f785bff02f7/README.md)

<a id="s28"></a>

**S28 — EpisodeYu/3GPP-Everything**

[backend/app/agent/nodes/tool_dispatch.py](https://github.com/EpisodeYu/3GPP-Everything/blob/ca5bd231304facd7110ce519f01777a7065a99f0/backend/app/agent/nodes/tool_dispatch.py) · [backend/pyproject.toml](https://github.com/EpisodeYu/3GPP-Everything/blob/ca5bd231304facd7110ce519f01777a7065a99f0/backend/pyproject.toml) · [README.md](https://github.com/EpisodeYu/3GPP-Everything/blob/ca5bd231304facd7110ce519f01777a7065a99f0/README.md)

<a id="s29"></a>

**S29 — NicholasGoh/fastapi-mcp-langgraph-template**

[backend/api/core/agent/orchestration.py](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template/blob/2bd004a51e5d741e8eaf5bb01716b6a673684a53/backend/api/core/agent/orchestration.py) · [backend/api/pyproject.toml](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template/blob/2bd004a51e5d741e8eaf5bb01716b6a673684a53/backend/api/pyproject.toml) · [README.md](https://github.com/NicholasGoh/fastapi-mcp-langgraph-template/blob/2bd004a51e5d741e8eaf5bb01716b6a673684a53/README.md)

<a id="s30"></a>

**S30 — sheikhhanif/LangGraph_Streaming**

[README.md](https://github.com/sheikhhanif/LangGraph_Streaming/blob/098873f926aaada6715da062897b29a2e914b841/README.md) · [main.py](https://github.com/sheikhhanif/LangGraph_Streaming/blob/098873f926aaada6715da062897b29a2e914b841/main.py)


## Tier 1 Candidates

**0。** 未发现公开证据足以支持“有现成 archive、接近所有冻结准入条件、可立即执行”的候选。不能为满足 3–8 个的期望数量而把 UNKNOWN 升级。

## Tier 2 Candidates

**1：deepagents（RANK 1，7 分，B / UNKNOWN / NEAR_MATCH）。** [S09](#s09) 的 LC/core 下界分别为 1.4.0/1.6.2；[PR #6201](https://github.com/langchain-ai/deepagents/pull/6201) 的公开标题涉及工具调用 ID 与 offload 文件名错误，[issue #6150](https://github.com/langchain-ai/deepagents/issues/6150) 涉及 read_file 二进制文件阻塞线程，提供真实问题上下文。这里只使用已核验的公开标题、作者和活动信息，不推断未读讨论中的结论。

已有 tracing 配置足以记 B，但尚未证明保存过原生未过滤事件、四包版本、单工具范围或 exporter provenance。默认 deep agent 执行包含 middleware/subagents，因此实际典型运行很可能不适配；保留 UNKNOWN 仅因为底层 create_agent 路径及接近的依赖范围值得一次 source 预核验，不是默许现有 harness 兼容。

## Rejected / Weak Patterns

- 18 个 Tier 3：可追溯的真实且近期工具项目，但公开 source 路径不符。既有 JSONL、span exporter 或 native stream 消费逻辑不能替代冻结源格式。
- 11 个 REJECT：ManasVardhan/agent-replay、AeroGraph、agent-trace、agent-inspect 缺少足够非 mock LC 工具运行证据；Graphiti 与当前 Cheshire Cat 未建立目标 LC agent 证据；deepagentschat、fastapi-mcp-langgraph-template、LangGraph_Streaming 属模板/教程证据不足；3GPP-Everything 的自定义 dispatcher 不能自动计为目标工具运行；langchain_aisdk_adapter 有真实示例但可核验 commit 已超过 12 月，未发现足够近期持续使用证据。
- 历史关系没有加分：PraisonAI 当前用自己的 loop 调用 LC 工具，archive 为 D、profile 为 UNLIKELY。此前互动不能证明本 profile 的试用或 adoption。
- “没有证据”不是“不存在”。例如 adapter 有 on_tool_end 方法，只能证明能力路径，不能证明某个外部用户已执行、保存并可交付该 archive。

## Existing Archive Availability Analysis

全体 30 个 raw candidates：A=6、B=17、C=0、D=7。真实工具 20 个中 A=3、B=16、C=0、D=1；近期 qualified 19 个中 A=3、B=15、C=0、D=1。C=0 来自刻意优先寻找 tracing 的采样方式，以及剩余项直接落入 poor-fit D；不是全生态无“弱归档”用户的推断。

| Public saved evidence | ARCHIVE | PUBLIC_EVENT_FIXTURE_FOUND | 为何不能直接交给 frozen validator |
| --- | --- | --- | --- |
| AeroGraph [fixture](#s03) | A | true | 顶层 description/fixtures JSON wrapper；不是每行一个 native v2 event；真实 LC 运行关联不足 |
| LoopLens [sample_run.jsonl](#s04) | A | true | 顶层 event_id/name/run_id/sequence/timestamp/type；是项目自定义 event schema |
| agent-trace [trace.ndjson](#s06) | A | true | data/event_ref/event_type/offset_ms/schema/sequence；无合格 LC source 关联证明 |
| agent-inspect [trace.jsonl](#s07) | A | true | camelCase runId 等自定义字段，JS producer |
| DeerFlow [replay fixture](#s08) | A | true | events/mode/scenario 包装的 JSON；不是 native v2 JSONL |
| Open Deep Research [公开 benchmark runs](#s15) | A | false | README 指向已保存 LangSmith 运行；未发现可直接核验的 frozen raw archive |

以上仅陈述结构，未复制工具参数、结果、prompt 或他人数据。fixture 的保存事实与真实用户运行是两层证据，前三类 synthetic/示例线索不能替代 real-tool 门槛。

B 级包括两种不同情况：sixty-north、jutul-agent、GraphARC 等已实现持久化 writer，但未见公开合格原始文件；EcoToxFred、Personal_Search_Assistant 等消费 stream，但保留原始 archive 未证实。即使已有 archive，sixty-north 的 turn 合并/ToolMessage 字符串化、jutul-agent 的 SQLite middleware records、OpenInference/Langfuse 的 OTel spans 都不能经改名或字段映射变成 admissible source。本轮未做任何转换。

**没有找到同时证明 native v2 + dump.dumps + 四包精确版本 + 单根普通工具 + 完整 provenance 的外部 archive。** 未发现不是全球不存在；仅限制本次扩大 pilot 的证据基础。

## Funnel Bottleneck Analysis

下表按用户期望的顺序计算同一 cohort，额外明确 profile gate。独立缺失计数另列，不把重叠指标相加。

| Sequential stage | Remain | Loss at this stage |
| --- | ---: | ---: |
| PUBLIC_PROJECT_OR_DEVELOPER | 30 | — |
| REAL_LANGCHAIN_USE（含工具桥接/集成，不只 create_agent） | 28 | 2 |
| REAL_TOOL_CALLING（本轮公开证据门槛） | 20 | 8 |
| RECENT_ACTIVE_USE（12 月内 commit 代理） | 19 | 1 |
| RUNTIME_TRACE_OR_EVENT_EVIDENCE | 18 | 1 |
| POSSIBLE_EXISTING_ARCHIVE（A/B） | 18 | 0 |
| CONTACTABLE | 18 | 0 |
| PROFILE_COMPATIBILITY != UNLIKELY | 1 | 17 |
| NATURALLY_PILOTABLE（用户公式，含 UNKNOWN） | 1 | 0 |

因此最大单阶段损失是 profile gate 的 **17/18**。如果先不加近期过滤，则 20 个真实工具项目有 19 个 A/B，其中 18 个 source 路径不符，结论一致。

| Diagnostic metric | Count | Denominator / interpretation |
| --- | ---: | --- |
| NO_REAL_LANGCHAIN_USE_COUNT | 2 | raw 30；未建立当前目标 LC 执行证据，不是断言从未使用 |
| NO_TOOL_CALLING_COUNT | 8 | 条件于有 LC 线索的 28；证据不足者，不把前一层 2 重复算入 |
| NO_ARCHIVE_EVIDENCE_COUNT | 7 | raw 30 的 C+D；包括 poor-fit D，不等于这些项目没有任何日志 |
| VERSION_OR_PROFILE_MISMATCH_COUNT | 27 | raw 30 的 UNLIKELY；含非 LC/JS/旧 pins/已观察格式问题，和其他诊断指标重叠 |
| NOT_CONTACTABLE_COUNT | 0 | raw 30 都有公开 repo/profile 路径；不代表会回复或适宜发无关 issue |

NATURAL_PILOT_RATE 的规定分母是全部真实工具项目 **20**，不是 raw 30、qualified 19 或 A/B 23；所以是 **1/20=0.05**。qualified 中的 1/19 不是本任务指标。

置信度：**Share with caveats**。格式/版本不匹配的具体观察置信度较高；维护者实际是否已有另一个未公开的原始 archive，置信度低。这是公开可见性的限制。若 UNKNOWN 也判不准入，natural count=0；若已标 UNLIKELY 的维护者另有满足全部条件的既存源，计数可能上升，目前无证据量化这种情况。该扫描不能识别源准备限制的市场因果效应，也不能把未联系当作市场拒绝。

**PRIMARY_FUNNEL_BOTTLENECK=PROFILE_COMPATIBILITY**；在 frozen profile 不变且 only-existing 的联合条件下，归档可用性的实际含义是“已有合格原始 archive 的可获得性”，不只是项目是否使用 tracing。

## Top 5 Outreach Shortlist

这是将来可由用户另行决定的 source 预核验名单，**不是五个已准备好的 pilot**。本轮未发送。每人的建议角度只询问现存源，不要求重新运行、增加 capture、升级依赖或披露敏感数据。

| Priority / person | 为什么选他；公开证据 | 最自然 CONTACT_PATH | 一句建议 angle |
| --- | --- | --- | --- |
| 1 / kowshikdev — deepagents | [PR #6201](https://github.com/langchain-ai/deepagents/pull/6201) 涉及 tool_call_id 与 offload；[S09](#s09) 依赖最接近。唯一条件 natural 候选 | [GITHUB_PROFILE](https://github.com/kowshikdev)，借现有工具 bug 上下文，渠道本身不代表发送许可 | “排查 tool_call_id/offload 问题时，你是否已经保留过普通单工具 create_agent 的未过滤 v2 原始 archive，以及对应版本和 exporter 信息？” |
| 2 / nn70ixux — EcoToxFred | [issue #28](https://github.com/yigbt/EcoToxFred/issues/28)、[issue #29](https://github.com/yigbt/EcoToxFred/issues/29) 分别涉及 CypherSearchTool 和工具显示；[PR #30](https://github.com/yigbt/EcoToxFred/pull/30) 升级 LC v1；[S21](#s21) 直接消费 v2 | [GITHUB_PROFILE](https://github.com/nn70ixux)，已有工具显示问题是自然语境 | “你排查工具显示问题时是否已经保存过未过滤的 v2 事件文件和当时版本信息，还是只留下 UI/console 输出？” |
| 3 / ekaterina-nikonova — langchain-replay | [最近 commit](https://github.com/sixty-north/langchain-replay/commit/92ab32f3e9154ed164023fd1ba2abdb4633af1b4) 可核验贡献角色；[S01](#s01) 直接实现录制/回放真实文件工具 | [GITHUB_PROFILE](https://github.com/ekaterina-nikonova)，围绕已有 recorder 设计 | “除 turn JSONL 外，你们是否已有保留原始 ToolMessage 和完整 envelope 的未过滤 v2 录制文件？” |
| 4 / jakobtorben — jutul-agent | [PR #42](https://github.com/SINTEF-agentlab/jutul-agent/pull/42) 关注 live sessions；[S26](#s26) 默认 session SQLite trace 可定位实际日志边界 | [GITHUB_PROFILE](https://github.com/jakobtorben)，以现有 session trace 为上下文 | “现有 session trace 之外，是否已经保存过未经 middleware 转换的 native v2 事件及其 exporter/版本记录？” |
| 5 / CorgiBoyG — DeerFlow | [PR #5221](https://github.com/bytedance/deer-flow/pull/5221) 的 run teardown 修复上下文；[S08](#s08) RunJournal、持久化和 replay fixture 完整 | [GITHUB_PROFILE](https://github.com/CorgiBoyG)，以 run completion/debugging 为上下文 | “你排查 run teardown 时是否已有 RunJournal 转换前的完整 native v2 archive，并能辨明单根普通工具的 capture scope？” |

第 2–5 项已有公开路径均为 UNLIKELY，只适合检查是否还存在其他既存 source。联系便利和技术相关性不能覆写版本/格式不符，也不能使其成为当前可执行 pilot。

## Decision on EXISTING_ARCHIVE_ONLY

依据用户门槛，NATURALLY_PILOTABLE_COUNT=1（即使严格计 0 也不改变区间），所以：

`EXISTING_ARCHIVE_ONLY_BLOCKER=true`

`FINAL_RECOMMENDATION=DESIGN_MINIMAL_SOURCE_PREPARATION_PATH_BEFORE_SCALING_OUTREACH`

本报告能够回答的是：在本次 30 个、刻意优先 tracing 的公开样本中，真实工具开发者并不稀缺，而已存在的原始 archive 与冻结 profile 的交集没有足够公开证据支撑规模化 pilot。不能据此声称全生态没有合格用户，也不能声称只要放宽 archive-only 就一定解决；四包版本、单工具范围与完整 provenance 仍是独立门槛。

## Recommended Next Action

将本报告交给用户决定下一轮是否单独授权 source preparation 路径的设计评估。冻结 profile 与当前 validator 保持原状。本轮到报告、commit、push 完成即停止；不创建 PR，不发送 shortlist 消息，不实现 helper，不做 architecture design。

报告采用确定性计数复核：30 个 repo 去重、所有 Sxx 指向观察 tree 中存在的路径、三个候选表 RANK 一一对应；A+B+C+D=30、real-tool=20、qualified=19、natural=1；评分由六项和封顶规则重算。Git scope 检查只允许新增本报告，执行 whitespace/diff 校验。产品未变化，未运行产品测试或他人 agent；这些均不能包装为外部验证。

## Machine Conclusions

以下为研究结论。REPORT_COMMIT 与 PUSHED 属提交后才可核验的交付字段，由最终交付回执给出；报告不写无法自引用的 commit hash 或预先宣称 push 成功。

```text
BASE_MAIN_HEAD=8b9d1bb0b0acf9eeecd7826a08668bb84bb80bee
RAW_CANDIDATES_REVIEWED=30
QUALIFIED_CANDIDATES=19
REAL_LANGCHAIN_TOOL_USERS=20
ARCHIVE_A_COUNT=6
ARCHIVE_B_COUNT=17
ARCHIVE_C_COUNT=0
ARCHIVE_D_COUNT=7
PUBLIC_EVENT_FIXTURE_FOUND_COUNT=5
CONFIRMED_PROFILE_QUALIFIED_ARCHIVE_COUNT=0
TIER_1_COUNT=0
TIER_2_COUNT=1
TIER_3_COUNT=18
REJECT_COUNT=11
NATURALLY_PILOTABLE_COUNT=1
NATURAL_PILOT_RATE=0.05
NO_REAL_LANGCHAIN_USE_COUNT=2
NO_TOOL_CALLING_COUNT=8
NO_ARCHIVE_EVIDENCE_COUNT=7
VERSION_OR_PROFILE_MISMATCH_COUNT=27
NOT_CONTACTABLE_COUNT=0
PRIMARY_FUNNEL_BOTTLENECK=PROFILE_COMPATIBILITY
EXISTING_ARCHIVE_ONLY_BLOCKER=true
TOP_5_SHORTLIST_CREATED=true
OUTREACH_PERFORMED=false
PRODUCT_CODE_CHANGED=false
VALIDATOR_CHANGED=false
PROFILE_CHANGED=false
ARCHITECTURE_CHANGE_REQUIRED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
REPORT_PATH=docs/development/kerniq_external_pilot_candidate_feasibility_scan_v0_7.md
FINAL_RECOMMENDATION=DESIGN_MINIMAL_SOURCE_PREPARATION_PATH_BEFORE_SCALING_OUTREACH
FINAL_STATUS=RESEARCH_COMPLETE_EXISTING_ARCHIVE_ONLY_BLOCKER_IDENTIFIED
```

`ARCHITECTURE_CHANGE_REQUIRED=false` 表示本轮没有提出或论证必须变更架构，不是对后续尚未开展的设计作保证。
