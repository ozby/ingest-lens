<wp_instruction_surface host="cursor" artifact="agent-rules/webpresso-routing.md -&gt; .cursor/rules/webpresso-routing.mdc" source="wp_routing">
<host_contract>
<native_tool_names>wp_test, wp_e2e, wp_lint, wp_typecheck, wp_qa, wp_audit, wp_ci_act, wp_worker_tail</native_tool_names>
<stdout_noop>Cursor command hooks that do not need to act write {} so the host receives valid JSON.</stdout_noop>
<lifecycle_notes>
<note>Cursor uses command groups; beforeSubmitPrompt is the prompt-time lifecycle.</note>
<note>Unsupported managed lifecycle names are represented in capability tests, not generated as inert hooks.</note>
</lifecycle_notes>
<public_support>Public support: generated Cursor rules surface plus managed hook config.</public_support>
</host_contract>
</wp_instruction_surface>
